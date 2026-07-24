import { closedBars, frameSnapshot } from "./indicators.js";

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
      oneWeekScore
    };
    const long = assessLong(common);
    const short = assessShort(common);
    const execution = shortExecutionProfile(bundle, market);
    const selected = selectAssessment(long, short, oneDayScore);
    let verdict = classifyAssessment(selected, {
      fresh,
      dataHealth,
      execution,
      volumeRequired: profile.volumeRequired,
      volumeAvailable
    });

    if (verdict === VERDICTS.INVEST && profile.volumeRequired && !volumeAvailable) {
      verdict = VERDICTS.OPTIONAL;
    }
    if (verdict === VERDICTS.SHORT && profile.volumeRequired && !volumeAvailable) {
      verdict = VERDICTS.SHORT_OPTIONAL;
    }

    const blockers = [...dataWarnings];
    if (!fresh) blockers.push("Veri güncel değil");
    if (selected.hardOpposition) blockers.push(selected.side === SIDES.LONG
      ? "1 saat ve 4 saat birlikte düşüş yönünde"
      : "1 saat ve 4 saat birlikte yükseliş yönünde");
    if (!common.volatilityPass) blockers.push("Oynaklık güvenli aralık dışında");
    if (profile.volumeRequired && !volumeAvailable) blockers.push("Güçlü karar için hacim yok");
    if (selected.effectiveRewardRisk < 1.45) blockers.push("Güncel fiyattan ödül/risk düşük");
    if (selected.side === SIDES.SHORT && !execution.actionable) blockers.push(execution.reason);

    const reasons = selected.factors.filter((item) => item.passed).sort(byWeight).slice(0, 6).map((item) => item.label);
    const failed = selected.factors.filter((item) => !item.passed).sort(byWeight).slice(0, 6).map((item) => item.label);
    const signalState = stateForVerdict(verdict, selected);
    const trigger = buildTrigger(base, selected, verdict);

    return {
      id: `${cleanSymbol(bundle.requestedSymbol)}-${base.time}-${selected.side}`,
      symbol: cleanSymbol(bundle.requestedSymbol),
      ticker: cleanText(bundle.ticker, 32),
      exchange: cleanText(bundle.exchange, 24),
      market,
      provider: bundle.provider,
      providerSymbol: cleanText(bundle.providerSymbol, 48),
      sourceLabel: sourceLabel(bundle.provider),
      analyzedAt: new Date(nowMs).toISOString(),
      barTime: new Date(base.time).toISOString(),
      verdict,
      verdictCode: verdictCode(verdict),
      tradeSide: selected.side,
      actionable: isActionable(verdict),
      signalState,
      technicalScore: selected.technicalScore,
      sideScores: { long: long.technicalScore, short: short.technicalScore },
      opportunityScore: opportunityScore(verdict, selected.technicalScore, dataHealth),
      dataHealth,
      setup: setupLabel(selected.setupCode, selected.side),
      setupCode: selected.setupCode,
      directions,
      directionScores: { intraday: base.trendScore, oneDay: oneDayScore, oneWeek: oneWeekScore },
      expectedRanges: {
        oneDay: expectedRange(base.price, day.atr, oneDayScore, 0.75),
        oneWeek: expectedRange(base.price, day.atr, oneWeekScore, 2.1)
      },
      plan: selected.plan,
      trigger,
      execution,
      reasons,
      failed,
      blockers: unique(blockers),
      factors: selected.factors,
      metrics: {
        price: round(base.price, 6),
        atr: round(base.atr, 6),
        atrPercent: round(common.atrPercent, 2),
        rsi: round(base.rsi, 1),
        adx: round(base.adx, 1),
        relativeVolume: round(base.relativeVolume, 2),
        distanceVwapAtr: round(common.distanceVwapAtr, 2),
        latestAgeMinutes: round(latestAgeMinutes, 1)
      },
      disclaimer: "Teknik Güç bir olasılık değildir. TradingView tahmine ödeme yapmaz; SHORT için uygun ürün ve aracı kurum gerekir."
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
  const setups = {
    trendPullback: upperFramesPass && emaAligned && aboveVwap && common.distanceVwapAtr <= 0.95 && base.rsi >= 49 && base.rsi <= 69,
    breakout: upperFramesPass && base.price > base.previousHigh && base.relativeVolume >= Math.max(1.3, profile.minRelativeVolume) && base.adx >= Math.max(20, profile.minAdx),
    retest: hour.trendScore >= 18 && base.low <= base.previousHigh + base.atr * 0.2 && base.price > base.previousHigh && base.price >= base.open,
    momentum: common.oneDayScore >= 45 && fourHour.trendScore >= 20 && base.macdHistogram > 0 && base.rsi >= 53 && base.rsi <= 70 && !overextended
  };
  const setupCode = selectSetup(setups, SIDES.LONG);
  const plan = buildPlan(base, setupCode, SIDES.LONG);
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
    volatilityPass: common.volatilityPass
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
  const setups = {
    failedRally: lowerFramesPass && emaAligned && belowVwap && common.distanceVwapAtr <= 0.95 && base.rsi >= 31 && base.rsi <= 51,
    breakdown: lowerFramesPass && base.price < base.previousLow && base.relativeVolume >= Math.max(1.3, profile.minRelativeVolume) && base.adx >= Math.max(20, profile.minAdx),
    breakdownRetest: hour.trendScore <= -18 && base.high >= base.previousLow - base.atr * 0.2 && base.price < base.previousLow && base.price <= base.open,
    downsideMomentum: common.oneDayScore <= -45 && fourHour.trendScore <= -20 && base.macdHistogram < 0 && base.rsi >= 29 && base.rsi <= 47 && !overextended
  };
  const setupCode = selectSetup(setups, SIDES.SHORT);
  const plan = buildPlan(base, setupCode, SIDES.SHORT);
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
    volatilityPass: common.volatilityPass
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

function classifyAssessment(selected, context) {
  if (!context.fresh) return VERDICTS.NO_DATA;
  const strong = selected.technicalScore >= 82 &&
    context.dataHealth >= 85 &&
    selected.setupCount >= 1 &&
    selected.effectiveRewardRisk >= 1.8 &&
    selected.directionStrong &&
    selected.framePass &&
    selected.volumePass &&
    selected.volatilityPass;
  const optional = selected.technicalScore >= 66 &&
    context.dataHealth >= 65 &&
    selected.setupCount >= 1 &&
    selected.effectiveRewardRisk >= 1.45 &&
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

function buildPlan(base, setupCode, side) {
  const long = side === SIDES.LONG;
  let entryMid = long
    ? Math.max(base.vwap || base.ema21, base.ema21 || base.price)
    : Math.min(base.vwap || base.ema21, base.ema21 || base.price);
  const levelSetup = ["breakout", "retest", "breakdown", "breakdownRetest"].includes(setupCode);
  if (levelSetup) entryMid = long ? base.previousHigh : base.previousLow;
  if (!Number.isFinite(entryMid) || entryMid <= 0) entryMid = base.price;

  const entryLow = entryMid - base.atr * (long ? 0.16 : 0.18);
  const entryHigh = entryMid + base.atr * (long ? 0.18 : 0.16);
  if (long) {
    const atrStop = entryMid - base.atr * 1.25;
    const structureStop = base.swingLow > 0 && base.swingLow < entryMid ? base.swingLow - base.atr * 0.1 : atrStop;
    const stopDistance = clamp(entryMid - Math.min(atrStop, structureStop), base.atr * 0.85, base.atr * 2.1);
    return {
      side,
      entryLow: round(entryLow, 6),
      entryHigh: round(entryHigh, 6),
      entryMid: round(entryMid, 6),
      chaseLimit: round(entryHigh + base.atr * 0.28, 6),
      maximumChase: round(entryHigh + base.atr * 0.28, 6),
      stop: round(entryMid - stopDistance, 6),
      target1: round(entryMid + stopDistance * 1.5, 6),
      target2: round(entryMid + stopDistance * 2.5, 6),
      invalidation: `15 dk kapanış ${formatPrice(entryMid - stopDistance)} altında`,
      validity: "4 kapanmış 15 dk mum veya seans sonu",
      effectiveRewardRisk: 0,
      quantityPer100k: 0
    };
  }

  const atrStop = entryMid + base.atr * 1.25;
  const structureStop = base.swingHigh > entryMid ? base.swingHigh + base.atr * 0.1 : atrStop;
  const stopDistance = clamp(Math.max(atrStop, structureStop) - entryMid, base.atr * 0.85, base.atr * 2.1);
  return {
    side,
    entryLow: round(entryLow, 6),
    entryHigh: round(entryHigh, 6),
    entryMid: round(entryMid, 6),
    chaseLimit: round(entryLow - base.atr * 0.28, 6),
    maximumChase: round(entryLow - base.atr * 0.28, 6),
    stop: round(entryMid + stopDistance, 6),
    target1: round(Math.max(0, entryMid - stopDistance * 1.5), 6),
    target2: round(Math.max(0, entryMid - stopDistance * 2.5), 6),
    invalidation: `15 dk kapanış ${formatPrice(entryMid + stopDistance)} üzerinde`,
    validity: "4 kapanmış 15 dk mum veya seans sonu",
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

function buildTrigger(base, selected, verdict) {
  const long = selected.side === SIDES.LONG;
  const level = long
    ? Math.max(base.high, selected.setupCode === "breakout" || selected.setupCode === "retest" ? base.previousHigh : base.ema9) + base.atr * 0.03
    : Math.min(base.low, selected.setupCode === "breakdown" || selected.setupCode === "breakdownRetest" ? base.previousLow : base.ema9) - base.atr * 0.03;
  const confirmed = [VERDICTS.INVEST, VERDICTS.OPTIONAL, VERDICTS.SHORT, VERDICTS.SHORT_OPTIONAL, VERDICTS.DECLINE].includes(verdict);
  return {
    side: selected.side,
    confirmationPrice: round(Math.max(0, level), 6),
    invalidationPrice: selected.plan.stop,
    confirmationText: confirmed
      ? `${long ? "Yükseliş" : "Düşüş"} koşulları son kapanmış 15 dk mumda teyit edildi`
      : `15 dk kapanış ${formatPrice(level)} ${long ? "üzerinde" : "altında"} olursa karar güçlenir`,
    entryText: `${formatPrice(selected.plan.entryLow)}–${formatPrice(selected.plan.entryHigh)} giriş bölgesi`,
    invalidationText: selected.plan.invalidation,
    reviewText: "Karar her kapanmış 15 dk mumdan sonra yeniden kurulur"
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
    }
  };
}

function summarizeEvidence(outcomes) {
  const closed = outcomes.filter((item) => ["TARGET1", "TARGET2", "STOP", "EXPIRED"].includes(item.result));
  const wins = closed.filter((item) => item.result === "TARGET1" || item.result === "TARGET2").length;
  const sampleSize = closed.length;
  if (sampleSize === 0) {
    return { sampleSize: 0, wins: 0, observedAccuracy: null, interval: null, grade: "KANIT YOK" };
  }
  const observedAccuracy = (wins / sampleSize) * 100;
  return {
    sampleSize,
    wins,
    observedAccuracy: round(observedAccuracy, 1),
    interval: wilsonInterval(wins, sampleSize),
    grade: sampleSize >= 150 ? "GÜÇLÜ" : sampleSize >= 60 ? "GELİŞİYOR" : sampleSize >= 30 ? "ERKEN" : "YETERSİZ"
  };
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
    verdictCode: -1,
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
    disclaimer: "Eksik veya güncel olmayan veriyle işlem kararı üretilmedi."
  };
}

function stateForVerdict(verdict, selected) {
  if (verdict === VERDICTS.INVEST) return "ONAYLI LONG";
  if (verdict === VERDICTS.OPTIONAL) return "LONG ADAYI";
  if (verdict === VERDICTS.SHORT) return "ONAYLI SHORT";
  if (verdict === VERDICTS.SHORT_OPTIONAL) return "SHORT ADAYI";
  if (verdict === VERDICTS.DECLINE) return "DÜŞÜŞ TEYİDİ";
  if (verdict === VERDICTS.WAIT) return selected.currentEntryValid ? "ONAY BEKLİYOR" : "GİRİŞ BÖLGESİ BEKLENİYOR";
  return "İŞLEM YOK";
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
