import { closedBars, frameSnapshot } from "./indicators.js";
import { isTradeOutcome } from "./lifecycle.js";

export const VERDICTS = Object.freeze({
  INVEST: "YATIR",
  OPTIONAL: "YATIRILABİLİR — SEN BİLİRSİN",
  SHORT: "SHORT — DÜŞÜŞ İŞLEMİ",
  SHORT_OPTIONAL: "SHORT ADAYI — SEN BİLİRSİN",
  DECLINE: "DÜŞÜŞ — UZAK DUR",
  WAIT: "BEKLE",
  AVOID: "YATIRMA",
  NO_DATA: "VERİ YETERSİZ"
});

export const SIDES = Object.freeze({
  LONG: "LONG",
  SHORT: "SHORT",
  NONE: "NONE"
});

export const HORIZONS = Object.freeze({
  INTRADAY: "INTRADAY",
  SWING: "SWING"
});

const MARKET_PROFILES = Object.freeze({
  STOCK: { volumeRequired: true, minRelativeVolume: 1.05, minAdx: 18, minAtrPct: 0.18, maxAtrPct: 6 },
  ETF: { volumeRequired: true, minRelativeVolume: 0.95, minAdx: 17, minAtrPct: 0.1, maxAtrPct: 5 },
  CRYPTO: { volumeRequired: true, minRelativeVolume: 1.02, minAdx: 20, minAtrPct: 0.25, maxAtrPct: 9 },
  FOREX: { volumeRequired: false, minRelativeVolume: 0, minAdx: 19, minAtrPct: 0.05, maxAtrPct: 4 },
  FUTURES: { volumeRequired: true, minRelativeVolume: 0.95, minAdx: 19, minAtrPct: 0.12, maxAtrPct: 7 },
  INDEX: { volumeRequired: false, minRelativeVolume: 0, minAdx: 17, minAtrPct: 0.08, maxAtrPct: 6 },
  COMMODITY: { volumeRequired: false, minRelativeVolume: 0, minAdx: 18, minAtrPct: 0.1, maxAtrPct: 7 },
  OTHER: { volumeRequired: true, minRelativeVolume: 1.05, minAdx: 20, minAtrPct: 0.15, maxAtrPct: 7 }
});

export function analyzeBundle(bundle, nowMs = Date.now()) {
  try {
    validateBundle(bundle);
    const market = normalizeMarket(bundle.market);
    if (market === "OPTION") {
      return noData(bundle, ["Opsiyon için vade, kullanım fiyatı, ima edilen oynaklık ve Greeks gerekli"], nowMs);
    }
    const profile = MARKET_PROFILES[market] ?? MARKET_PROFILES.OTHER;
    const frames = prepareFrames(bundle, nowMs);
    const snapshots = Object.fromEntries(Object.entries(frames).map(([name, bars]) => [name, frameSnapshot(bars)]));
    const missingFrames = Object.entries(snapshots).filter(([, snapshot]) => !snapshot).map(([name]) => frameLabel(name));
    if (missingFrames.length > 0) return noData(bundle, [`Yetersiz kapanmış mum: ${missingFrames.join(", ")}`], nowMs);

    const base = snapshots.fifteen;
    const hour = snapshots.hour;
    const fourHour = snapshots.fourHour;
    const day = snapshots.day;
    const latestAgeMinutes = Math.max(0, (nowMs - base.time) / 60_000);
    const activeMarket = market === "CRYPTO" || bundle.meta?.marketOpen === true;
    const freshnessLimitMinutes = activeMarket ? 45 : 5 * 24 * 60;
    const fresh = latestAgeMinutes <= freshnessLimitMinutes;
    const volumeAvailable = base.volume > 0 && frames.fifteen.slice(-20).some((bar) => bar.volume > 0);
    const atrValid = base.atr > 0 && Number.isFinite(base.atr);
    const allHistoryHealthy = Object.values(snapshots).every((snapshot) => snapshot.enoughHistory);

    const dataWarnings = [];
    let dataHealth = 100;
    if (!fresh) {
      dataHealth -= 55;
      dataWarnings.push(`15 dk veri ${Math.round(latestAgeMinutes)} dakika eski`);
    }
    if (!atrValid) {
      dataHealth -= 60;
      dataWarnings.push("ATR hesaplanamadı");
    }
    if (!allHistoryHealthy) {
      dataHealth -= 15;
      dataWarnings.push("Bazı zaman dilimlerinde geçmiş sınırlı");
    }
    if (profile.volumeRequired && !volumeAvailable) {
      dataHealth -= 30;
      dataWarnings.push("Bu piyasa için hacim doğrulanamadı");
    }
    if (!bundle.provider) {
      dataHealth -= 25;
      dataWarnings.push("Veri kaynağı tanımsız");
    }
    dataHealth = clamp(Math.round(dataHealth), 0, 100);
    if (!atrValid || dataHealth < 45) return noData(bundle, dataWarnings, nowMs, dataHealth);

    const oneDayScore = weightedScore([
      [base.trendScore, 0.32],
      [hour.trendScore, 0.34],
      [fourHour.trendScore, 0.24],
      [day.trendScore, 0.10]
    ]);
    const oneWeekScore = weightedScore([
      [hour.trendScore, 0.08],
      [fourHour.trendScore, 0.27],
      [day.trendScore, 0.65]
    ]);
    const directions = {
      intraday: directionFromScore(base.trendScore),
      oneDay: directionFromScore(oneDayScore),
      oneWeek: directionFromScore(oneWeekScore)
    };

    const common = {
      base,
      hour,
      fourHour,
      day,
      profile,
      volumeAvailable,
      atrPercent: base.atrPercent,
      distanceVwapAtr: Math.abs(base.price - base.vwap) / Math.max(base.atr, 1e-9),
      volumePass: !profile.volumeRequired || (volumeAvailable && base.relativeVolume >= profile.minRelativeVolume),
      volatilityPass: base.atrPercent >= profile.minAtrPct && base.atrPercent <= profile.maxAtrPct,
      oneDayScore,
      oneWeekScore,
      regime: detectRegime(base, hour, fourHour, day, profile),
      swingRegime: detectSwingRegime(fourHour, day, profile)
    };
    const execution = shortExecutionProfile(bundle, market);
    const intradayLong = assessLong(common);
    const intradayShort = assessShort(common);
    const intraday = buildHorizonDecision({
      bundle,
      horizon: HORIZONS.INTRADAY,
      base,
      long: intradayLong,
      short: intradayShort,
      directionBias: oneDayScore,
      execution,
      fresh,
      dataHealth,
      dataWarnings,
      profile,
      volumeAvailable,
      volatilityPass: common.volatilityPass
    });
    const swingLong = assessSwingLong(common);
    const swingShort = assessSwingShort(common);
    const swing = buildHorizonDecision({
      bundle,
      horizon: HORIZONS.SWING,
      base: day,
      long: swingLong,
      short: swingShort,
      directionBias: oneWeekScore,
      execution,
      fresh,
      dataHealth,
      dataWarnings,
      profile,
      volumeAvailable: day.volume > 0,
      volatilityPass: swingLong.volatilityPass || swingShort.volatilityPass
    });
    const horizons = { intraday, swing };
    const primary = selectPrimaryHorizon(intraday, swing);

    return {
      ...primary,
      symbol: cleanSymbol(bundle.requestedSymbol),
      ticker: cleanText(bundle.ticker, 32),
      exchange: cleanText(bundle.exchange, 24),
      market,
      provider: bundle.provider,
      providerSymbol: cleanText(bundle.providerSymbol, 48),
      sourceLabel: sourceLabel(bundle.provider),
      analyzedAt: new Date(nowMs).toISOString(),
      primaryHorizon: primary.horizon,
      horizons,
      dataHealth,
      directions,
      directionScores: { intraday: base.trendScore, oneDay: oneDayScore, oneWeek: oneWeekScore },
      expectedRanges: {
        oneDay: expectedRange(base.price, day.atr, oneDayScore, 0.75),
        oneWeek: expectedRange(base.price, day.atr, oneWeekScore, 2.1)
      },
      regime: primary.regime,
      freeMode: true,
      latestAgeMinutes: round(latestAgeMinutes, 1),
      disclaimer: "FinPilot Free yalnız karar desteğidir. Teknik Güç olasılık değildir; SHORT için uygun ürün ve aracı kurum gerekir."
    };
  } catch (error) {
    return noData(bundle ?? {}, [cleanText(error?.message || "Analiz yapılamadı", 180)], nowMs);
  }
}

function assessLong(common) {
  const { base, hour, fourHour, day, profile } = common;
  const emaAligned = base.ema9 > base.ema21 && base.ema21 > base.ema50;
  const aboveVwap = base.price > base.vwap;
  const momentumPass = base.rsi >= 50 && base.rsi <= 72 && base.adx >= profile.minAdx && base.macdHistogram >= 0;
  const upperFramesPass = hour.trendScore >= 18 && fourHour.trendScore >= 12;
  const dailyCompatible = day.trendScore > -25;
  const overextended = common.distanceVwapAtr > 1.5 || base.rsi > 75 || base.price > base.bollinger.upper * 1.005;
  const hardOpposition = hour.trendScore <= -25 && fourHour.trendScore <= -20;
  const setupTests = {
    trendPullback: [upperFramesPass, emaAligned, aboveVwap, common.distanceVwapAtr <= 0.95, base.rsi >= 49 && base.rsi <= 69],
    breakout: [upperFramesPass, base.price > base.previousHigh, base.relativeVolume >= Math.max(1.3, profile.minRelativeVolume), base.adx >= Math.max(20, profile.minAdx)],
    retest: [hour.trendScore >= 18, base.low <= base.previousHigh + base.atr * 0.2, base.price > base.previousHigh, base.price >= base.open],
    momentum: [common.oneDayScore >= 45, fourHour.trendScore >= 20, base.macdHistogram > 0, base.rsi >= 53 && base.rsi <= 70, !overextended],
    rangeReversalLong: [common.regime.code === "RANGE", base.rsi >= 32 && base.rsi <= 47, base.low <= base.bollinger.lower * 1.01, base.price > base.open, day.trendScore > -35]
  };
  const tournament = buildStrategyTournament(setupTests, SIDES.LONG, common.regime);
  const setups = tournamentSetupMap(tournament);
  const setupCode = tournament.selectedCode;
  const plan = buildPlan(base, setupCode, SIDES.LONG, HORIZONS.INTRADAY);
  const currentEntryValid = base.price >= plan.entryLow && base.price <= plan.chaseLimit;
  finishPlan(plan, base.price);
  const factors = [
    factor("15 dk yükseliş", base.trendScore >= 20, 9, `${base.trendScore}/100`, "≥ 20"),
    factor("1 saat yükseliş", hour.trendScore >= 20, 11, `${hour.trendScore}/100`, "≥ 20"),
    factor("4 saat yükseliş", fourHour.trendScore >= 15, 12, `${fourHour.trendScore}/100`, "≥ 15"),
    factor("Günlük yapı", dailyCompatible, 7, `${day.trendScore}/100`, "> -25"),
    factor("Yükseliş EMA dizilimi", emaAligned, 9, formatTriple(base.ema9, base.ema21, base.ema50), "EMA9 > EMA21 > EMA50"),
    factor("VWAP üstü", aboveVwap, 8, `${formatPrice(base.price)} / ${formatPrice(base.vwap)}`, "Fiyat > VWAP"),
    factor("Aşırı uzamama", !overextended, 8, `${round(common.distanceVwapAtr, 2)} ATR`, "≤ 1,50 ATR"),
    factor("Yükseliş momentumu", momentumPass, 9, `RSI ${round(base.rsi, 1)} · ADX ${round(base.adx, 1)}`, "RSI 50–72"),
    factor("Hacim/katılım", common.volumePass, 8, common.volumeAvailable ? `${round(base.relativeVolume, 2)}x` : "Yok", profile.volumeRequired ? `≥ ${profile.minRelativeVolume}x` : "Zorunlu değil"),
    factor("Oynaklık", common.volatilityPass, 6, `%${round(common.atrPercent, 2)}`, `%${profile.minAtrPct}–%${profile.maxAtrPct}`),
    factor("LONG kurulumu", Object.values(setups).some(Boolean), 8, setupLabel(setupCode, SIDES.LONG), "En az bir kurulum"),
    factor("Ödül/risk", plan.effectiveRewardRisk >= 1.45, 5, `${round(plan.effectiveRewardRisk, 2)}R`, "≥ 1,45R")
  ];
  return assessment(SIDES.LONG, setups, setupCode, plan, factors, {
    currentEntryValid,
    overextended,
    hardOpposition,
    framePass: upperFramesPass,
    directionStrong: common.oneDayScore >= 42 && common.oneWeekScore >= 18,
    directionOptional: common.oneDayScore >= 20 && hour.trendScore >= 15,
    volumePass: common.volumePass,
    volatilityPass: common.volatilityPass,
    tournament,
    regime: common.regime
  });
}

function assessShort(common) {
  const { base, hour, fourHour, day, profile } = common;
  const emaAligned = base.ema9 < base.ema21 && base.ema21 < base.ema50;
  const belowVwap = base.price < base.vwap;
  const momentumPass = base.rsi >= 28 && base.rsi <= 50 && base.adx >= profile.minAdx && base.macdHistogram <= 0;
  const lowerFramesPass = hour.trendScore <= -18 && fourHour.trendScore <= -12;
  const dailyCompatible = day.trendScore < 25;
  const overextended = common.distanceVwapAtr > 1.5 || base.rsi < 25 || base.price < base.bollinger.lower * 0.995;
  const hardOpposition = hour.trendScore >= 25 && fourHour.trendScore >= 20;
  const setupTests = {
    failedRally: [lowerFramesPass, emaAligned, belowVwap, common.distanceVwapAtr <= 0.95, base.rsi >= 31 && base.rsi <= 51],
    breakdown: [lowerFramesPass, base.price < base.previousLow, base.relativeVolume >= Math.max(1.3, profile.minRelativeVolume), base.adx >= Math.max(20, profile.minAdx)],
    breakdownRetest: [hour.trendScore <= -18, base.high >= base.previousLow - base.atr * 0.2, base.price < base.previousLow, base.price <= base.open],
    downsideMomentum: [common.oneDayScore <= -45, fourHour.trendScore <= -20, base.macdHistogram < 0, base.rsi >= 29 && base.rsi <= 47, !overextended],
    rangeReversalShort: [common.regime.code === "RANGE", base.rsi >= 53 && base.rsi <= 68, base.high >= base.bollinger.upper * 0.99, base.price < base.open, day.trendScore < 35]
  };
  const tournament = buildStrategyTournament(setupTests, SIDES.SHORT, common.regime);
  const setups = tournamentSetupMap(tournament);
  const setupCode = tournament.selectedCode;
  const plan = buildPlan(base, setupCode, SIDES.SHORT, HORIZONS.INTRADAY);
  const currentEntryValid = base.price <= plan.entryHigh && base.price >= plan.chaseLimit;
  finishPlan(plan, base.price);
  const factors = [
    factor("15 dk düşüş", base.trendScore <= -20, 9, `${base.trendScore}/100`, "≤ -20"),
    factor("1 saat düşüş", hour.trendScore <= -20, 11, `${hour.trendScore}/100`, "≤ -20"),
    factor("4 saat düşüş", fourHour.trendScore <= -15, 12, `${fourHour.trendScore}/100`, "≤ -15"),
    factor("Günlük düşüş yapısı", dailyCompatible, 7, `${day.trendScore}/100`, "< 25"),
    factor("Düşüş EMA dizilimi", emaAligned, 9, formatTriple(base.ema9, base.ema21, base.ema50), "EMA9 < EMA21 < EMA50"),
    factor("VWAP altı", belowVwap, 8, `${formatPrice(base.price)} / ${formatPrice(base.vwap)}`, "Fiyat < VWAP"),
    factor("Aşırı satılmama", !overextended, 8, `${round(common.distanceVwapAtr, 2)} ATR`, "≤ 1,50 ATR"),
    factor("Düşüş momentumu", momentumPass, 9, `RSI ${round(base.rsi, 1)} · ADX ${round(base.adx, 1)}`, "RSI 28–50"),
    factor("Hacim/katılım", common.volumePass, 8, common.volumeAvailable ? `${round(base.relativeVolume, 2)}x` : "Yok", profile.volumeRequired ? `≥ ${profile.minRelativeVolume}x` : "Zorunlu değil"),
    factor("Oynaklık", common.volatilityPass, 6, `%${round(common.atrPercent, 2)}`, `%${profile.minAtrPct}–%${profile.maxAtrPct}`),
    factor("SHORT kurulumu", Object.values(setups).some(Boolean), 8, setupLabel(setupCode, SIDES.SHORT), "En az bir kurulum"),
    factor("Ödül/risk", plan.effectiveRewardRisk >= 1.45, 5, `${round(plan.effectiveRewardRisk, 2)}R`, "≥ 1,45R")
  ];
  return assessment(SIDES.SHORT, setups, setupCode, plan, factors, {
    currentEntryValid,
    overextended,
    hardOpposition,
    framePass: lowerFramesPass,
    directionStrong: common.oneDayScore <= -42 && common.oneWeekScore <= -18,
    directionOptional: common.oneDayScore <= -20 && hour.trendScore <= -15,
    volumePass: common.volumePass,
    volatilityPass: common.volatilityPass,
    tournament,
    regime: common.regime
  });
}

function assessSwingLong(common) {
  const { day, fourHour, profile } = common;
  const distanceEmaAtr = Math.abs(day.price - day.ema21) / Math.max(day.atr, 1e-9);
  const emaAligned = day.ema9 > day.ema21 && day.ema21 > day.ema50;
  const aboveStructure = day.price >= day.ema21;
  const framePass = day.trendScore >= 18 && fourHour.trendScore >= 8;
  const overextended = distanceEmaAtr > 1.8 || day.rsi > 76 || day.price > day.bollinger.upper * 1.01;
  const hardOpposition = day.trendScore <= -28 && fourHour.trendScore <= -20;
  const volumePass = !profile.volumeRequired || (day.volume > 0 && day.relativeVolume >= Math.max(0.82, profile.minRelativeVolume * 0.78));
  const volatilityPass = day.atrPercent >= profile.minAtrPct * 0.7 && day.atrPercent <= profile.maxAtrPct * 1.6;
  const setupTests = {
    swingPullbackLong: [framePass, emaAligned, aboveStructure, distanceEmaAtr <= 1.1, day.rsi >= 46 && day.rsi <= 69],
    dailyBreakout: [day.price > day.previousHigh, day.relativeVolume >= Math.max(1.08, profile.minRelativeVolume), day.adx >= Math.max(18, profile.minAdx), fourHour.trendScore >= 10],
    swingMomentumLong: [common.oneWeekScore >= 35, day.trendScore >= 32, day.macdHistogram > 0, day.rsi >= 51 && day.rsi <= 72, !overextended],
    swingRangeReversalLong: [common.swingRegime.code === "RANGE", day.rsi >= 34 && day.rsi <= 47, day.low <= day.bollinger.lower * 1.02, day.price > day.open, fourHour.trendScore > -25]
  };
  const tournament = buildStrategyTournament(setupTests, SIDES.LONG, common.swingRegime);
  const setups = tournamentSetupMap(tournament);
  const setupCode = tournament.selectedCode;
  const plan = buildPlan(day, setupCode, SIDES.LONG, HORIZONS.SWING);
  const currentEntryValid = day.price >= plan.entryLow && day.price <= plan.chaseLimit;
  finishPlan(plan, day.price);
  const factors = [
    factor("Günlük yükseliş yapısı", day.trendScore >= 20, 13, `${day.trendScore}/100`, "≥ 20"),
    factor("4 saat teyidi", fourHour.trendScore >= 10, 10, `${fourHour.trendScore}/100`, "≥ 10"),
    factor("Günlük EMA dizilimi", emaAligned, 11, formatTriple(day.ema9, day.ema21, day.ema50), "EMA9 > EMA21 > EMA50"),
    factor("Ana yapının üstü", aboveStructure, 8, `${formatPrice(day.price)} / ${formatPrice(day.ema21)}`, "Fiyat ≥ EMA21"),
    factor("1–5 gün momentumu", day.rsi >= 48 && day.rsi <= 72 && day.macdHistogram >= 0, 9, `RSI ${round(day.rsi, 1)}`, "RSI 48–72"),
    factor("Aşırı uzamama", !overextended, 8, `${round(distanceEmaAtr, 2)} ATR`, "≤ 1,80 ATR"),
    factor("Günlük hacim", volumePass, 8, day.volume > 0 ? `${round(day.relativeVolume, 2)}x` : "Yok", "Sağlıklı katılım"),
    factor("Günlük oynaklık", volatilityPass, 7, `%${round(day.atrPercent, 2)}`, "Piyasa profiline uygun"),
    factor("Swing LONG kurulumu", Object.values(setups).some(Boolean), 10, setupLabel(setupCode, SIDES.LONG), "En az bir kurulum"),
    factor("Ödül/risk", plan.effectiveRewardRisk >= 1.65, 6, `${round(plan.effectiveRewardRisk, 2)}R`, "≥ 1,65R")
  ];
  return assessment(SIDES.LONG, setups, setupCode, plan, factors, {
    currentEntryValid,
    overextended,
    hardOpposition,
    framePass,
    directionStrong: common.oneWeekScore >= 35 && day.trendScore >= 20,
    directionOptional: common.oneWeekScore >= 15 && day.trendScore >= 10,
    volumePass,
    volatilityPass,
    tournament,
    regime: common.swingRegime
  });
}

function assessSwingShort(common) {
  const { day, fourHour, profile } = common;
  const distanceEmaAtr = Math.abs(day.price - day.ema21) / Math.max(day.atr, 1e-9);
  const emaAligned = day.ema9 < day.ema21 && day.ema21 < day.ema50;
  const belowStructure = day.price <= day.ema21;
  const framePass = day.trendScore <= -18 && fourHour.trendScore <= -8;
  const overextended = distanceEmaAtr > 1.8 || day.rsi < 24 || day.price < day.bollinger.lower * 0.99;
  const hardOpposition = day.trendScore >= 28 && fourHour.trendScore >= 20;
  const volumePass = !profile.volumeRequired || (day.volume > 0 && day.relativeVolume >= Math.max(0.82, profile.minRelativeVolume * 0.78));
  const volatilityPass = day.atrPercent >= profile.minAtrPct * 0.7 && day.atrPercent <= profile.maxAtrPct * 1.6;
  const setupTests = {
    swingPullbackShort: [framePass, emaAligned, belowStructure, distanceEmaAtr <= 1.1, day.rsi >= 31 && day.rsi <= 54],
    dailyBreakdown: [day.price < day.previousLow, day.relativeVolume >= Math.max(1.08, profile.minRelativeVolume), day.adx >= Math.max(18, profile.minAdx), fourHour.trendScore <= -10],
    swingMomentumShort: [common.oneWeekScore <= -35, day.trendScore <= -32, day.macdHistogram < 0, day.rsi >= 28 && day.rsi <= 49, !overextended],
    swingRangeReversalShort: [common.swingRegime.code === "RANGE", day.rsi >= 53 && day.rsi <= 66, day.high >= day.bollinger.upper * 0.98, day.price < day.open, fourHour.trendScore < 25]
  };
  const tournament = buildStrategyTournament(setupTests, SIDES.SHORT, common.swingRegime);
  const setups = tournamentSetupMap(tournament);
  const setupCode = tournament.selectedCode;
  const plan = buildPlan(day, setupCode, SIDES.SHORT, HORIZONS.SWING);
  const currentEntryValid = day.price <= plan.entryHigh && day.price >= plan.chaseLimit;
  finishPlan(plan, day.price);
  const factors = [
    factor("Günlük düşüş yapısı", day.trendScore <= -20, 13, `${day.trendScore}/100`, "≤ -20"),
    factor("4 saat düşüş teyidi", fourHour.trendScore <= -10, 10, `${fourHour.trendScore}/100`, "≤ -10"),
    factor("Günlük düşüş EMA dizilimi", emaAligned, 11, formatTriple(day.ema9, day.ema21, day.ema50), "EMA9 < EMA21 < EMA50"),
    factor("Ana yapının altı", belowStructure, 8, `${formatPrice(day.price)} / ${formatPrice(day.ema21)}`, "Fiyat ≤ EMA21"),
    factor("1–5 gün düşüş momentumu", day.rsi >= 28 && day.rsi <= 52 && day.macdHistogram <= 0, 9, `RSI ${round(day.rsi, 1)}`, "RSI 28–52"),
    factor("Aşırı satılmama", !overextended, 8, `${round(distanceEmaAtr, 2)} ATR`, "≤ 1,80 ATR"),
    factor("Günlük hacim", volumePass, 8, day.volume > 0 ? `${round(day.relativeVolume, 2)}x` : "Yok", "Sağlıklı katılım"),
    factor("Günlük oynaklık", volatilityPass, 7, `%${round(day.atrPercent, 2)}`, "Piyasa profiline uygun"),
    factor("Swing SHORT kurulumu", Object.values(setups).some(Boolean), 10, setupLabel(setupCode, SIDES.SHORT), "En az bir kurulum"),
    factor("Ödül/risk", plan.effectiveRewardRisk >= 1.65, 6, `${round(plan.effectiveRewardRisk, 2)}R`, "≥ 1,65R")
  ];
  return assessment(SIDES.SHORT, setups, setupCode, plan, factors, {
    currentEntryValid,
    overextended,
    hardOpposition,
    framePass,
    directionStrong: common.oneWeekScore <= -35 && day.trendScore <= -20,
    directionOptional: common.oneWeekScore <= -15 && day.trendScore <= -10,
    volumePass,
    volatilityPass,
    tournament,
    regime: common.swingRegime
  });
}

function assessment(side, setups, setupCode, plan, factors, gates) {
  const totalWeight = factors.reduce((sum, item) => sum + item.weight, 0);
  const passedWeight = factors.filter((item) => item.passed).reduce((sum, item) => sum + item.weight, 0);
  return {
    side,
    setups,
    setupCode,
    setupCount: Object.values(setups).filter(Boolean).length,
    plan,
    factors,
    technicalScore: Math.round((passedWeight / totalWeight) * 100),
    effectiveRewardRisk: plan.effectiveRewardRisk,
    ...gates
  };
}

function selectAssessment(long, short, oneDayScore) {
  if (short.technicalScore >= long.technicalScore + 6 && oneDayScore <= -8) return short;
  if (long.technicalScore >= short.technicalScore + 6 && oneDayScore >= 8) return long;
  if (oneDayScore <= -20) return short;
  return long;
}

function buildHorizonDecision({
  bundle,
  horizon,
  base,
  long,
  short,
  directionBias,
  execution,
  fresh,
  dataHealth,
  dataWarnings,
  profile,
  volumeAvailable,
  volatilityPass
}) {
  const selected = selectAssessment(long, short, directionBias);
  let verdict = classifyAssessment(selected, {
    fresh,
    dataHealth,
    execution,
    volumeRequired: profile.volumeRequired,
    volumeAvailable
  }, horizon);
  if (verdict === VERDICTS.INVEST && profile.volumeRequired && !volumeAvailable) verdict = VERDICTS.OPTIONAL;
  if (verdict === VERDICTS.SHORT && profile.volumeRequired && !volumeAvailable) verdict = VERDICTS.SHORT_OPTIONAL;

  const blockers = [...dataWarnings];
  if (!fresh) blockers.push("Veri güncel değil");
  if (selected.hardOpposition) {
    blockers.push(horizon === HORIZONS.SWING
      ? selected.side === SIDES.LONG
        ? "Günlük ve 4 saat yapı birlikte düşüş yönünde"
        : "Günlük ve 4 saat yapı birlikte yükseliş yönünde"
      : selected.side === SIDES.LONG
        ? "1 saat ve 4 saat birlikte düşüş yönünde"
        : "1 saat ve 4 saat birlikte yükseliş yönünde");
  }
  if (!volatilityPass) blockers.push("Oynaklık seçili vade için güvenli aralık dışında");
  if (profile.volumeRequired && !volumeAvailable) blockers.push("Güçlü karar için hacim yok");
  const minimumReward = horizon === HORIZONS.SWING ? 1.65 : 1.45;
  if (selected.effectiveRewardRisk < minimumReward) blockers.push("Güncel fiyattan ödül/risk düşük");
  if (selected.side === SIDES.SHORT && !execution.actionable) blockers.push(execution.reason);

  const reasons = selected.factors.filter((item) => item.passed).sort(byWeight).slice(0, 7).map((item) => item.label);
  const failed = selected.factors.filter((item) => !item.passed).sort(byWeight).slice(0, 7).map((item) => item.label);
  const signalState = stateForVerdict(verdict, selected, horizon);
  const trigger = buildTrigger(base, selected, verdict, horizon);
  const code = verdictCode(verdict);
  return {
    id: `${cleanSymbol(bundle.requestedSymbol)}-${base.time}-${horizon}-${selected.side}`,
    horizon,
    horizonLabel: horizon === HORIZONS.SWING ? "1–5 GÜN" : "15 DK",
    barTime: new Date(base.time).toISOString(),
    verdict,
    decisionLabel: explicitDecisionLabel(verdict, horizon),
    verdictCode: code,
    tradeSide: selected.side,
    actionable: isActionable(verdict),
    signalState,
    technicalScore: selected.technicalScore,
    sideScores: { long: long.technicalScore, short: short.technicalScore },
    opportunityScore: opportunityScore(verdict, selected.technicalScore, dataHealth),
    setup: setupLabel(selected.setupCode, selected.side),
    setupCode: selected.setupCode,
    plan: selected.plan,
    trigger,
    execution,
    reasons,
    failed,
    blockers: unique(blockers),
    factors: selected.factors,
    regime: selected.regime ?? { code: "TRANSITION", label: "Geçiş piyasası" },
    strategyTournament: selected.tournament ?? null,
    metrics: {
      price: round(base.price, 6),
      atr: round(base.atr, 6),
      atrPercent: round(base.atrPercent, 2),
      rsi: round(base.rsi, 1),
      adx: round(base.adx, 1),
      relativeVolume: round(base.relativeVolume, 2),
      distanceAnchorAtr: round(Math.abs(base.price - (horizon === HORIZONS.SWING ? base.ema21 : base.vwap)) / Math.max(base.atr, 1e-9), 2)
    }
  };
}

function selectPrimaryHorizon(intraday, swing) {
  const ranked = [intraday, swing].sort((left, right) =>
    Number(right.verdictCode) - Number(left.verdictCode) ||
    Number(right.opportunityScore) - Number(left.opportunityScore) ||
    Number(right.technicalScore) - Number(left.technicalScore) ||
    (left.horizon === HORIZONS.INTRADAY ? -1 : 1)
  );
  return ranked[0];
}

function classifyAssessment(selected, context, horizon = HORIZONS.INTRADAY) {
  if (!context.fresh) return VERDICTS.NO_DATA;
  const swing = horizon === HORIZONS.SWING;
  const strong = selected.technicalScore >= (swing ? 80 : 82) &&
    context.dataHealth >= (swing ? 80 : 85) &&
    selected.setupCount >= 1 &&
    selected.effectiveRewardRisk >= (swing ? 1.9 : 1.8) &&
    selected.directionStrong &&
    selected.framePass &&
    selected.volumePass &&
    selected.volatilityPass;
  const optional = selected.technicalScore >= (swing ? 64 : 66) &&
    context.dataHealth >= 65 &&
    selected.setupCount >= 1 &&
    selected.effectiveRewardRisk >= (swing ? 1.65 : 1.45) &&
    selected.directionOptional &&
    selected.volatilityPass;

  if (selected.hardOpposition || selected.technicalScore < 48) return VERDICTS.AVOID;
  if (selected.overextended || !selected.currentEntryValid || (selected.setupCount === 0 && selected.technicalScore >= 55)) {
    if (selected.side === SIDES.SHORT && selected.technicalScore >= 58) return VERDICTS.DECLINE;
    return VERDICTS.WAIT;
  }
  if (strong) {
    if (selected.side === SIDES.LONG) return VERDICTS.INVEST;
    return context.execution.actionable ? VERDICTS.SHORT : VERDICTS.DECLINE;
  }
  if (optional) {
    if (selected.side === SIDES.LONG) return VERDICTS.OPTIONAL;
    return context.execution.actionable ? VERDICTS.SHORT_OPTIONAL : VERDICTS.DECLINE;
  }
  if (selected.side === SIDES.SHORT && selected.directionOptional && selected.technicalScore >= 52) return VERDICTS.DECLINE;
  return selected.technicalScore >= 55 ? VERDICTS.WAIT : VERDICTS.AVOID;
}

function buildPlan(base, setupCode, side, horizon = HORIZONS.INTRADAY) {
  const long = side === SIDES.LONG;
  const swing = horizon === HORIZONS.SWING;
  let entryMid = long
    ? Math.max(swing ? base.ema21 : base.vwap || base.ema21, base.ema21 || base.price)
    : Math.min(swing ? base.ema21 : base.vwap || base.ema21, base.ema21 || base.price);
  const levelSetup = ["breakout", "retest", "breakdown", "breakdownRetest", "dailyBreakout", "dailyBreakdown"].includes(setupCode);
  if (levelSetup) entryMid = long ? base.previousHigh : base.previousLow;
  if (!Number.isFinite(entryMid) || entryMid <= 0) entryMid = base.price;

  const bandLow = swing ? 0.28 : long ? 0.16 : 0.18;
  const bandHigh = swing ? 0.28 : long ? 0.18 : 0.16;
  const entryLow = entryMid - base.atr * bandLow;
  const entryHigh = entryMid + base.atr * bandHigh;
  const entryValidityMs = swing ? 4 * 24 * 60 * 60_000 : 4 * 15 * 60_000;
  const maxHoldingMs = swing ? 8 * 24 * 60 * 60_000 : 4 * 15 * 60_000;
  const entryMaxBars = swing ? 2 : 4;
  const maxHoldingBars = swing ? 5 : 4;
  const stopMultiplier = swing ? 1.55 : 1.25;
  const maximumStop = swing ? 2.5 : 2.1;
  const targetOneR = swing ? 1.8 : 1.5;
  const targetTwoR = swing ? 3 : 2.5;
  const candleLabel = swing ? "Günlük" : "15 dk";
  if (long) {
    const atrStop = entryMid - base.atr * stopMultiplier;
    const structureStop = base.swingLow > 0 && base.swingLow < entryMid ? base.swingLow - base.atr * 0.1 : atrStop;
    const stopDistance = clamp(entryMid - Math.min(atrStop, structureStop), base.atr * (swing ? 1.1 : 0.85), base.atr * maximumStop);
    return {
      side,
      horizon,
      entryLow: round(entryLow, 6),
      entryHigh: round(entryHigh, 6),
      entryMid: round(entryMid, 6),
      chaseLimit: round(entryHigh + base.atr * (swing ? 0.35 : 0.28), 6),
      maximumChase: round(entryHigh + base.atr * (swing ? 0.35 : 0.28), 6),
      stop: round(entryMid - stopDistance, 6),
      target1: round(entryMid + stopDistance * targetOneR, 6),
      target2: round(entryMid + stopDistance * targetTwoR, 6),
      invalidation: `${candleLabel} kapanış ${formatPrice(entryMid - stopDistance)} altında`,
      validity: swing ? "2 kapanmış günlük mum içinde giriş; azami 5 işlem günü" : "4 kapanmış 15 dk mum içinde giriş; azami 1 saat takip",
      entryValidityMs,
      maxHoldingMs,
      entryMaxBars,
      maxHoldingBars,
      riskPercent: 0.5,
      effectiveRewardRisk: 0,
      quantityPer100k: 0
    };
  }

  const atrStop = entryMid + base.atr * stopMultiplier;
  const structureStop = base.swingHigh > entryMid ? base.swingHigh + base.atr * 0.1 : atrStop;
  const stopDistance = clamp(Math.max(atrStop, structureStop) - entryMid, base.atr * (swing ? 1.1 : 0.85), base.atr * maximumStop);
  return {
    side,
    horizon,
    entryLow: round(entryLow, 6),
    entryHigh: round(entryHigh, 6),
    entryMid: round(entryMid, 6),
    chaseLimit: round(entryLow - base.atr * (swing ? 0.35 : 0.28), 6),
    maximumChase: round(entryLow - base.atr * (swing ? 0.35 : 0.28), 6),
    stop: round(entryMid + stopDistance, 6),
    target1: round(Math.max(0, entryMid - stopDistance * targetOneR), 6),
    target2: round(Math.max(0, entryMid - stopDistance * targetTwoR), 6),
    invalidation: `${candleLabel} kapanış ${formatPrice(entryMid + stopDistance)} üzerinde`,
    validity: swing ? "2 kapanmış günlük mum içinde giriş; azami 5 işlem günü" : "4 kapanmış 15 dk mum içinde giriş; azami 1 saat takip",
    entryValidityMs,
    maxHoldingMs,
    entryMaxBars,
    maxHoldingBars,
    riskPercent: 0.5,
    effectiveRewardRisk: 0,
    quantityPer100k: 0
  };
}

function finishPlan(plan, currentPrice) {
  const long = plan.side === SIDES.LONG;
  const reference = long ? Math.max(currentPrice, plan.entryMid) : Math.min(currentPrice, plan.entryMid);
  const risk = long ? reference - plan.stop : plan.stop - reference;
  const reward = long ? plan.target2 - reference : reference - plan.target2;
  plan.effectiveRewardRisk = round(reward / Math.max(risk, 1e-9), 2);
  plan.quantityPer100k = Math.max(0, Math.floor(500 / Math.max(0.01, Math.abs(plan.entryMid - plan.stop))));
}

function buildTrigger(base, selected, verdict, horizon = HORIZONS.INTRADAY) {
  const long = selected.side === SIDES.LONG;
  const swing = horizon === HORIZONS.SWING;
  const levelSetup = ["breakout", "retest", "dailyBreakout"].includes(selected.setupCode);
  const shortLevelSetup = ["breakdown", "breakdownRetest", "dailyBreakdown"].includes(selected.setupCode);
  const level = long
    ? Math.max(base.high, levelSetup ? base.previousHigh : base.ema9) + base.atr * (swing ? 0.05 : 0.03)
    : Math.min(base.low, shortLevelSetup ? base.previousLow : base.ema9) - base.atr * (swing ? 0.05 : 0.03);
  const confirmed = [VERDICTS.INVEST, VERDICTS.OPTIONAL, VERDICTS.SHORT, VERDICTS.SHORT_OPTIONAL, VERDICTS.DECLINE].includes(verdict);
  const candleLabel = swing ? "Günlük" : "15 dk";
  return {
    side: selected.side,
    confirmationPrice: round(Math.max(0, level), 6),
    invalidationPrice: selected.plan.stop,
    confirmationText: confirmed
      ? `${long ? "Yükseliş" : "Düşüş"} koşulları son kapanmış ${candleLabel} mumda teyit edildi`
      : `${candleLabel} kapanış ${formatPrice(level)} ${long ? "üzerinde" : "altında"} olursa karar güçlenir`,
    entryText: `${formatPrice(selected.plan.entryLow)}–${formatPrice(selected.plan.entryHigh)} giriş bölgesi`,
    invalidationText: selected.plan.invalidation,
    reviewText: swing ? "Swing karar günlük mum kapanışında yeniden kurulur" : "Karar her kapanmış 15 dk mumdan sonra yeniden kurulur"
  };
}

function shortExecutionProfile(bundle, market) {
  const exchange = String(bundle.exchange ?? "").toUpperCase();
  const ticker = String(bundle.ticker ?? "").toUpperCase();
  const derivativeCrypto = market === "CRYPTO" && (/PERP|\.P$/u.test(ticker) || ["BYBIT", "OKX"].includes(exchange));
  if (market === "FUTURES") {
    return {
      actionable: true,
      status: "ARACI KURUM GEREKLİ",
      label: "Vadeli üründe SHORT planı uygulanabilir",
      reason: "Gerçek işlem için ürünü destekleyen aracı kurum ve teminat gerekir"
    };
  }
  if (market === "FOREX") {
    return {
      actionable: true,
      status: "ARACI KURUM GEREKLİ",
      label: "Çift yönlü forex hesabında SHORT planı uygulanabilir",
      reason: "Gerçek işlem için çift yönlü işlem destekleyen aracı kurum gerekir"
    };
  }
  if (derivativeCrypto) {
    return {
      actionable: true,
      status: "KALDIRAÇ RİSKİ",
      label: "Türev kripto ürünü SHORT destekleyebilir",
      reason: "Fonlama, kaldıraç ve likidasyon koşulları ayrıca kontrol edilmelidir"
    };
  }
  if (market === "CRYPTO") {
    return {
      actionable: false,
      status: "SPOTTA SHORT YOK",
      label: "Bu spot çiftte yalnız düşüş/uzak dur uyarısı",
      reason: "Spot kriptoda fiyat düşüşü tek başına kazanç sağlamaz; türev ürün gerekir"
    };
  }
  if (market === "STOCK" || market === "ETF") {
    return {
      actionable: false,
      status: "UYGUNLUK DOĞRULANMADI",
      label: "Açığa satış uygunluğu aracı kurumdan doğrulanmalı",
      reason: "Hisse açığa satış listesi, ödünç bulunabilirliği ve aracı kurum yetkisi doğrulanmadı"
    };
  }
  return {
    actionable: false,
    status: "DOĞRUDAN SHORT YOK",
    label: "Bu sembol için işlem yapılabilir türev ürün seçilmeli",
    reason: "Endeks veya referans fiyat doğrudan SHORT edilemez; uygun işlem ürünü gerekir"
  };
}

export function computeEvidence(outcomes) {
  const source = Array.isArray(outcomes) ? outcomes : [];
  const aggregate = summarizeEvidence(source);
  return {
    ...aggregate,
    bySide: {
      LONG: summarizeEvidence(source.filter((item) => (item.side ?? item.plan?.side ?? SIDES.LONG) === SIDES.LONG)),
      SHORT: summarizeEvidence(source.filter((item) => (item.side ?? item.plan?.side) === SIDES.SHORT))
    },
    byHorizon: {
      INTRADAY: summarizeEvidence(source.filter((item) => (item.horizon ?? HORIZONS.INTRADAY) === HORIZONS.INTRADAY)),
      SWING: summarizeEvidence(source.filter((item) => item.horizon === HORIZONS.SWING))
    }
  };
}

function summarizeEvidence(outcomes) {
  const closed = outcomes.filter((item) =>
    isTradeOutcome(item) &&
    ["TARGET1", "TARGET2", "STOP", "EXPIRED", "BREAKEVEN", "TIME_EXIT"].includes(item.result)
  );
  const realized = closed.map(outcomeR);
  const wins = realized.filter((value) => value > 0.05).length;
  const sampleSize = closed.length;
  if (sampleSize === 0) {
    return { sampleSize: 0, wins: 0, observedAccuracy: null, interval: null, expectancyR: null, grade: "KANIT YOK" };
  }
  const observedAccuracy = (wins / sampleSize) * 100;
  return {
    sampleSize,
    wins,
    observedAccuracy: round(observedAccuracy, 1),
    interval: wilsonInterval(wins, sampleSize),
    expectancyR: round(realized.reduce((sum, value) => sum + value, 0) / sampleSize, 2),
    grade: sampleSize >= 150 ? "GÜÇLÜ" : sampleSize >= 60 ? "GELİŞİYOR" : sampleSize >= 30 ? "ERKEN" : "YETERSİZ"
  };
}

function outcomeR(item) {
  const explicit = Number(item?.realizedR);
  if (Number.isFinite(explicit)) return explicit;
  if (item?.result === "TARGET2") return Number(item?.plan?.targetTwoR) || 2.5;
  if (item?.result === "TARGET1") return 1.5;
  if (item?.result === "STOP") return -1;
  return 0;
}

export function wilsonInterval(successes, total, z = 1.96) {
  if (!Number.isFinite(total) || total <= 0) return null;
  const p = successes / total;
  const denominator = 1 + (z * z) / total;
  const center = (p + (z * z) / (2 * total)) / denominator;
  const spread = (z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total)) / denominator;
  return [round(Math.max(0, center - spread) * 100, 1), round(Math.min(1, center + spread) * 100, 1)];
}

function prepareFrames(bundle, nowMs) {
  const result = {};
  for (const name of ["fifteen", "hour", "fourHour", "day"]) {
    const interval = Number(bundle.intervals?.[name]);
    if (!Number.isFinite(interval) || interval <= 0) throw new Error(`${frameLabel(name)} aralığı geçersiz`);
    result[name] = closedBars(bundle.frames?.[name], interval, nowMs);
  }
  return result;
}

function noData(bundle, blockers, nowMs, dataHealth = 0) {
  return {
    id: `${cleanSymbol(bundle?.requestedSymbol)}-${nowMs}`,
    symbol: cleanSymbol(bundle?.requestedSymbol),
    ticker: cleanText(bundle?.ticker, 32),
    exchange: cleanText(bundle?.exchange, 24),
    market: normalizeMarket(bundle?.market),
    provider: cleanText(bundle?.provider, 16),
    providerSymbol: cleanText(bundle?.providerSymbol, 48),
    sourceLabel: sourceLabel(bundle?.provider),
    analyzedAt: new Date(nowMs).toISOString(),
    barTime: null,
    verdict: VERDICTS.NO_DATA,
    decisionLabel: VERDICTS.NO_DATA,
    verdictCode: -1,
    horizon: HORIZONS.INTRADAY,
    primaryHorizon: HORIZONS.INTRADAY,
    horizons: null,
    tradeSide: SIDES.NONE,
    actionable: false,
    signalState: "VERİ BEKLİYOR",
    technicalScore: 0,
    sideScores: { long: 0, short: 0 },
    opportunityScore: 0,
    dataHealth,
    setup: "Kurulum yok",
    setupCode: "none",
    directions: { intraday: "BELİRSİZ", oneDay: "BELİRSİZ", oneWeek: "BELİRSİZ" },
    directionScores: { intraday: 0, oneDay: 0, oneWeek: 0 },
    expectedRanges: null,
    plan: null,
    trigger: null,
    execution: null,
    reasons: [],
    failed: [],
    blockers: unique(blockers),
    factors: [],
    metrics: {},
    freeMode: true,
    disclaimer: "Eksik veya güncel olmayan veriyle işlem kararı üretilmedi."
  };
}

function stateForVerdict(verdict, selected, horizon = HORIZONS.INTRADAY) {
  if (verdict === VERDICTS.INVEST || verdict === VERDICTS.SHORT) return "GİRİŞ AKTİF";
  if (verdict === VERDICTS.OPTIONAL || verdict === VERDICTS.SHORT_OPTIONAL) return "TETİK BEKLİYOR";
  if (verdict === VERDICTS.DECLINE) return "DÜŞÜŞ TEYİDİ";
  if (verdict === VERDICTS.WAIT) return selected.currentEntryValid
    ? `${horizon === HORIZONS.SWING ? "GÜNLÜK" : "15 DK"} ONAY BEKLİYOR`
    : "GİRİŞ BÖLGESİ BEKLENİYOR";
  return "İŞLEM YOK";
}

function explicitDecisionLabel(verdict, horizon) {
  const swing = horizon === HORIZONS.SWING;
  if (verdict === VERDICTS.INVEST) return swing ? "1–5 GÜN AL" : "15 DK ONAYLI AL";
  if (verdict === VERDICTS.OPTIONAL) return swing ? "1–5 GÜN AL ADAYI" : "15 DK AL ADAYI";
  if (verdict === VERDICTS.SHORT) return swing ? "1–5 GÜN SHORT" : "15 DK ONAYLI SHORT";
  if (verdict === VERDICTS.SHORT_OPTIONAL) return swing ? "1–5 GÜN SHORT ADAYI" : "15 DK SHORT ADAYI";
  if (verdict === VERDICTS.DECLINE) return swing ? "1–5 GÜN DÜŞÜŞ — UZAK DUR" : "15 DK DÜŞÜŞ — UZAK DUR";
  if (verdict === VERDICTS.WAIT) return swing ? "1–5 GÜN BEKLE" : "15 DK BEKLE";
  if (verdict === VERDICTS.AVOID) return swing ? "1–5 GÜN İŞLEM YOK" : "15 DK İŞLEM YOK";
  return VERDICTS.NO_DATA;
}

function opportunityScore(verdict, technicalScore, dataHealth) {
  const actionBonus = [VERDICTS.INVEST, VERDICTS.SHORT].includes(verdict)
    ? 20
    : [VERDICTS.OPTIONAL, VERDICTS.SHORT_OPTIONAL].includes(verdict)
      ? 12
      : verdict === VERDICTS.DECLINE
        ? 7
        : 0;
  return Math.round(clamp(technicalScore * 0.68 + dataHealth * 0.22 + actionBonus, 0, 100));
}

function expectedRange(price, dailyAtr, score, multiplier) {
  const directionShift = clamp(score / 100, -1, 1) * dailyAtr * multiplier * 0.35;
  const spread = dailyAtr * multiplier;
  return {
    low: round(Math.max(0, price + directionShift - spread), 6),
    high: round(price + directionShift + spread, 6)
  };
}

function validateBundle(bundle) {
  if (!bundle || typeof bundle !== "object") throw new Error("Piyasa veri paketi yok");
  if (!bundle.requestedSymbol) throw new Error("Sembol yok");
  if (!bundle.frames || !bundle.intervals) throw new Error("Mum verisi yok");
}

function factor(label, passed, weight, actual, required) {
  return { label, passed: Boolean(passed), weight, actual, required };
}

function tournamentSetupMap(tournament) {
  return Object.fromEntries((tournament?.candidates ?? []).map((item) => [item.code, item.eligible]));
}

function buildStrategyTournament(setupTests, side, regime) {
  const candidates = Object.entries(setupTests).map(([code, tests]) => {
    const passed = tests.filter(Boolean).length;
    const completion = tests.length > 0 ? passed / tests.length : 0;
    const baseScore = completion * 100;
    const bonus = strategyRegimeBonus(code, regime?.code);
    const score = clamp(Math.round(baseScore + bonus), 0, 100);
    return {
      code,
      label: setupLabel(code, side),
      score,
      eligible: tests.length > 0 && (passed === tests.length || (completion >= 0.8 && score >= 82)),
      passed,
      total: tests.length
    };
  }).sort((left, right) =>
    Number(right.eligible) - Number(left.eligible) ||
    right.score - left.score
  );
  return {
    regime: regime?.label ?? "Geçiş piyasası",
    selectedCode: candidates.find((item) => item.eligible)?.code ?? "none",
    candidates
  };
}

function strategyRegimeBonus(code, regime) {
  if (regime === "RANGE") return /RangeReversal/u.test(code) ? 8 : -6;
  if (regime === "TREND") return /Pullback|Momentum/u.test(code) || ["trendPullback", "failedRally", "momentum", "downsideMomentum"].includes(code) ? 6 : 0;
  if (regime === "VOLATILE") return /reak|retest|Retest/u.test(code) ? 8 : -3;
  return /retest|Retest/u.test(code) ? 3 : 0;
}

function detectRegime(base, hour, fourHour, day, profile) {
  const alignedUp = hour.trendScore >= 18 && fourHour.trendScore >= 12 && day.trendScore > -20;
  const alignedDown = hour.trendScore <= -18 && fourHour.trendScore <= -12 && day.trendScore < 20;
  if (base.atrPercent >= profile.maxAtrPct * 0.72 && base.adx >= 24) {
    return { code: "VOLATILE", label: "Yüksek oynaklık / kırılım piyasası" };
  }
  if (hour.adx < 18 && fourHour.adx < 18 && Math.abs(hour.trendScore) < 30) {
    return { code: "RANGE", label: "Yatay / dönüş piyasası" };
  }
  if (alignedUp || alignedDown) return { code: "TREND", label: alignedUp ? "Yükseliş trendi" : "Düşüş trendi" };
  return { code: "TRANSITION", label: "Geçiş / kararsız piyasa" };
}

function detectSwingRegime(fourHour, day, profile) {
  if (day.atrPercent >= profile.maxAtrPct * 1.05 && day.adx >= 24) {
    return { code: "VOLATILE", label: "Swing yüksek oynaklık" };
  }
  if (day.adx < 18 && Math.abs(day.trendScore) < 28) {
    return { code: "RANGE", label: "Swing yatay piyasa" };
  }
  if (
    (day.trendScore >= 20 && fourHour.trendScore >= 8) ||
    (day.trendScore <= -20 && fourHour.trendScore <= -8)
  ) {
    return { code: "TREND", label: day.trendScore >= 20 ? "Swing yükseliş trendi" : "Swing düşüş trendi" };
  }
  return { code: "TRANSITION", label: "Swing geçiş piyasası" };
}

function selectSetup(setups, side) {
  const order = side === SIDES.LONG
    ? ["retest", "breakout", "trendPullback", "momentum"]
    : ["breakdownRetest", "breakdown", "failedRally", "downsideMomentum"];
  return order.find((key) => setups[key]) ?? "none";
}

function setupLabel(code, side = SIDES.LONG) {
  const labels = {
    retest: "Kırılım yeniden testi",
    breakout: "Hacimli yukarı kırılım",
    trendPullback: "Trend geri çekilmesi",
    momentum: "Yükseliş momentumu",
    breakdownRetest: "Aşağı kırılım yeniden testi",
    breakdown: "Hacimli aşağı kırılım",
    failedRally: "Başarısız yükseliş",
    downsideMomentum: "Düşüş momentumu",
    rangeReversalLong: "Yatay piyasada yukarı dönüş",
    rangeReversalShort: "Yatay piyasada aşağı dönüş",
    swingPullbackLong: "Swing trend geri çekilmesi",
    dailyBreakout: "Günlük yukarı kırılım",
    swingMomentumLong: "1–5 gün yükseliş momentumu",
    swingRangeReversalLong: "Günlük banttan yukarı dönüş",
    swingPullbackShort: "Swing başarısız yükseliş",
    dailyBreakdown: "Günlük aşağı kırılım",
    swingMomentumShort: "1–5 gün düşüş momentumu",
    swingRangeReversalShort: "Günlük banttan aşağı dönüş",
    none: side === SIDES.SHORT ? "SHORT kurulumu yok" : "LONG kurulumu yok"
  };
  return labels[code] ?? labels.none;
}

function normalizeMarket(value) {
  const market = String(value ?? "OTHER").toUpperCase();
  if (market === "OPTION") return "OPTION";
  return MARKET_PROFILES[market] ? market : "OTHER";
}

function directionFromScore(score) {
  if (score >= 20) return "YÜKSELİŞ";
  if (score <= -20) return "DÜŞÜŞ";
  return "YATAY/BELİRSİZ";
}

function weightedScore(values) {
  return Math.round(values.reduce((sum, [value, weight]) => sum + value * weight, 0));
}

function sourceLabel(provider) {
  return provider === "BINANCE" ? "Binance açık piyasa verisi" : provider === "YAHOO" ? "Genel piyasa grafiği verisi" : "Kaynak yok";
}

function frameLabel(name) {
  return ({ fifteen: "15 dakika", hour: "1 saat", fourHour: "4 saat", day: "Günlük" })[name] ?? name;
}

function verdictCode(value) {
  if ([VERDICTS.INVEST, VERDICTS.SHORT].includes(value)) return 4;
  if ([VERDICTS.OPTIONAL, VERDICTS.SHORT_OPTIONAL].includes(value)) return 3;
  if (value === VERDICTS.WAIT) return 2;
  if (value === VERDICTS.DECLINE) return 1;
  if (value === VERDICTS.AVOID) return 0;
  return -1;
}

function isActionable(verdict) {
  return [VERDICTS.INVEST, VERDICTS.OPTIONAL, VERDICTS.SHORT, VERDICTS.SHORT_OPTIONAL].includes(verdict);
}

function byWeight(a, b) {
  return b.weight - a.weight;
}

function formatTriple(a, b, c) {
  return `${formatPrice(a)} / ${formatPrice(b)} / ${formatPrice(c)}`;
}

function formatPrice(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  if (Math.abs(number) >= 1000) return number.toLocaleString("tr-TR", { maximumFractionDigits: 2 });
  if (Math.abs(number) >= 1) return number.toLocaleString("tr-TR", { maximumFractionDigits: 4 });
  return number.toLocaleString("tr-TR", { maximumFractionDigits: 8 });
}

function cleanSymbol(value) {
  return String(value ?? "UNKNOWN").replace(/[^A-Za-z0-9_.!:\-/]/gu, "").slice(0, 64) || "UNKNOWN";
}

function cleanText(value, maximum) {
  return String(value ?? "").replace(/[\u0000-\u001F\u007F]/gu, "").slice(0, maximum);
}

function unique(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter(Boolean))];
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value, digits = 2) {
  const multiplier = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * multiplier) / multiplier;
}

export { MARKET_PROFILES };
