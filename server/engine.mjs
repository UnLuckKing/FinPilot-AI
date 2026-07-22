const VERDICTS = Object.freeze({
  INVEST: "YATIR",
  OPTIONAL: "YATIRILABİLİR — SEN BİLİRSİN",
  WAIT: "BEKLE",
  AVOID: "YATIRMA",
  NO_DATA: "VERİ YETERSİZ"
});

const MARKET_PROFILES = Object.freeze({
  STOCK: { volumeRequired: true, minRelativeVolume: 1.1, minAdx: 18, minAtrPct: 0.25, maxAtrPct: 6 },
  ETF: { volumeRequired: true, minRelativeVolume: 1.0, minAdx: 17, minAtrPct: 0.15, maxAtrPct: 5 },
  CRYPTO: { volumeRequired: true, minRelativeVolume: 1.05, minAdx: 20, minAtrPct: 0.35, maxAtrPct: 8 },
  FOREX: { volumeRequired: false, minRelativeVolume: 0, minAdx: 20, minAtrPct: 0.08, maxAtrPct: 3 },
  FUTURES: { volumeRequired: true, minRelativeVolume: 1.0, minAdx: 19, minAtrPct: 0.15, maxAtrPct: 6 },
  INDEX: { volumeRequired: false, minRelativeVolume: 0, minAdx: 18, minAtrPct: 0.1, maxAtrPct: 5 },
  COMMODITY: { volumeRequired: false, minRelativeVolume: 0, minAdx: 19, minAtrPct: 0.12, maxAtrPct: 6 },
  BOND: { volumeRequired: false, minRelativeVolume: 0, minAdx: 17, minAtrPct: 0.03, maxAtrPct: 3 },
  OPTION: { volumeRequired: true, minRelativeVolume: 1.2, minAdx: 22, minAtrPct: 0.2, maxAtrPct: 15 },
  OTHER: { volumeRequired: true, minRelativeVolume: 1.1, minAdx: 20, minAtrPct: 0.2, maxAtrPct: 6 }
});

export function analyzeMarket(input, now = new Date()) {
  const market = normalizeMarket(input.marketType);
  const profile = MARKET_PROFILES[market];
  const m = sanitizeMetrics(input.metrics ?? {});
  const confirmed = input.confirmed === true;
  const sentAt = parseDate(input.sentAt);
  const ageSeconds = sentAt ? Math.max(0, (now.getTime() - sentAt.getTime()) / 1000) : Number.POSITIVE_INFINITY;
  const fresh = input.data?.fresh !== false && ageSeconds <= 6 * 60;
  const volumeAvailable = input.data?.volumeAvailable === true || (m.volume > 0 && m.averageVolume > 0);
  const priceValid = m.price > 0 && m.atr > 0 && Number.isFinite(m.price) && Number.isFinite(m.atr);
  const enoughHistory = input.data?.enoughHistory !== false;

  let dataHealth = 100;
  const dataWarnings = [];
  if (!confirmed) { dataHealth -= 35; dataWarnings.push("15 dakikalık mum henüz kapanmadı"); }
  if (!fresh) { dataHealth -= 40; dataWarnings.push("Analiz güncel değil"); }
  if (!priceValid) { dataHealth -= 70; dataWarnings.push("Fiyat veya ATR verisi geçersiz"); }
  if (!enoughHistory) { dataHealth -= 30; dataWarnings.push("Gösterge geçmişi yetersiz"); }
  if (profile.volumeRequired && !volumeAvailable) { dataHealth -= 30; dataWarnings.push("Bu piyasa için hacim verisi yok"); }
  if (!m.hourTrendKnown) { dataHealth -= 8; dataWarnings.push("1 saat yönü doğrulanamadı"); }
  if (!m.fourHourTrendKnown) { dataHealth -= 8; dataWarnings.push("4 saat yönü doğrulanamadı"); }
  dataHealth = clamp(Math.round(dataHealth), 0, 100);

  if (!priceValid) {
    return noDataResult(input, market, dataHealth, dataWarnings, now);
  }

  const atrPercent = m.atrPercent > 0 ? m.atrPercent : (m.atr / m.price) * 100;
  const distanceVwapAtr = m.atr > 0 ? Math.abs(m.price - m.vwap) / m.atr : 99;
  const emaAligned = m.ema9 > m.ema21 && m.ema21 > m.ema50;
  const aboveVwap = m.vwap > 0 && m.price > m.vwap;
  const hourBullish = m.hourBullish === true;
  const fourHourBullish = m.fourHourBullish === true;
  const dailyBullish = m.dailyBullish === true;
  const weeklyBullish = m.weeklyBullish === true;
  const benchmarkHealthy = m.benchmarkBullish !== false;
  const volumePass = !profile.volumeRequired || (volumeAvailable && m.relativeVolume >= profile.minRelativeVolume);
  const volatilityPass = atrPercent >= profile.minAtrPct && atrPercent <= profile.maxAtrPct;
  const momentumPass = m.rsi >= 50 && m.rsi <= 72 && m.adx >= profile.minAdx && m.macdHistogram >= 0;
  const overextended = distanceVwapAtr > 1.45 || m.rsi > 74;
  const hardBearish = !hourBullish && !fourHourBullish && !dailyBullish;

  const setupFlags = {
    trendPullback: hourBullish && fourHourBullish && emaAligned && aboveVwap && distanceVwapAtr <= 0.9 && m.rsi >= 50 && m.rsi <= 69,
    breakout: hourBullish && fourHourBullish && m.previousHigh > 0 && m.price > m.previousHigh && m.relativeVolume >= Math.max(1.35, profile.minRelativeVolume) && m.adx >= Math.max(20, profile.minAdx),
    retest: hourBullish && m.previousHigh > 0 && m.low <= m.previousHigh + m.atr * 0.18 && m.price > m.previousHigh && m.price >= m.open,
    relativeLeader: hourBullish && fourHourBullish && benchmarkHealthy && m.relativeStrength20 > 0.015 && aboveVwap && !overextended
  };
  const setups = Object.entries(setupFlags).filter(([, active]) => active).map(([name]) => name);
  const primarySetup = selectSetup(setupFlags);

  const factors = [];
  addFactor(factors, "15 dk EMA dizilimi", emaAligned, 10, formatTriple(m.ema9, m.ema21, m.ema50), "EMA9 > EMA21 > EMA50");
  addFactor(factors, "1 saat trend", hourBullish, 9, direction(m.hourBullish), "Yükseliş");
  addFactor(factors, "4 saat trend", fourHourBullish, 10, direction(m.fourHourBullish), "Yükseliş");
  addFactor(factors, "1 günlük trend", dailyBullish, 7, direction(m.dailyBullish), "Yükseliş");
  addFactor(factors, "1 haftalık trend", weeklyBullish, 4, direction(m.weeklyBullish), "Yükseliş");
  addFactor(factors, "VWAP konumu", aboveVwap, 9, `${round(m.price)} / ${round(m.vwap)}`, "Fiyat > VWAP");
  addFactor(factors, "Aşırı uzamama", !overextended, 8, `${round(distanceVwapAtr)} ATR`, "≤ 1,45 ATR");
  addFactor(factors, "Momentum", momentumPass, 10, `RSI ${round(m.rsi, 1)} · ADX ${round(m.adx, 1)}`, "RSI 50–72 · ADX yeterli");
  addFactor(factors, "Katılım/hacim", volumePass, 9, volumeAvailable ? `${round(m.relativeVolume)}x` : "Hacim yok", profile.volumeRequired ? `≥ ${profile.minRelativeVolume}x` : "İsteğe bağlı");
  addFactor(factors, "Oynaklık", volatilityPass, 7, `%${round(atrPercent)}`, `%${profile.minAtrPct}–%${profile.maxAtrPct}`);
  addFactor(factors, "Piyasa karşılaştırması", benchmarkHealthy, 6, direction(m.benchmarkBullish), "Düşüş olmamalı");
  addFactor(factors, "Geçerli kurulum", setups.length > 0, 11, setupLabel(primarySetup), "En az bir kurulum");

  const totalWeight = factors.reduce((sum, factor) => sum + factor.weight, 0);
  const passedWeight = factors.filter((factor) => factor.passed).reduce((sum, factor) => sum + factor.weight, 0);
  const score = Math.round((passedWeight / totalWeight) * 100);
  const plan = buildPlan(m, primarySetup);
  const currentEntryValid = m.price >= plan.entryLow && m.price <= plan.maximumChase;
  const effectiveRewardRisk = (plan.target2 - Math.max(m.price, plan.entryMid)) / Math.max(0.000001, Math.max(m.price, plan.entryMid) - plan.stop);
  plan.effectiveRewardRisk = round(effectiveRewardRisk);
  plan.quantityPer100k = Math.max(0, Math.floor(500 / Math.max(0.01, plan.entryMid - plan.stop)));

  const blockers = [];
  if (market === "OPTION") blockers.push("Opsiyonlarda kullanım fiyatı, vade ve ima edilen oynaklık olmadan güçlü karar kapalı");
  if (!confirmed) blockers.push("Mum kapanışı bekleniyor");
  if (!fresh) blockers.push("Veri eski");
  if (dataHealth < 60) blockers.push("Veri sağlığı yetersiz");
  if (hardBearish) blockers.push("Üst zaman dilimleri düşüş yönünde");
  if (!volatilityPass) blockers.push("Oynaklık güvenli aralık dışında");
  if (effectiveRewardRisk < 1.45) blockers.push("Güncel fiyattan ödül/risk yetersiz");
  if (profile.volumeRequired && !volumeAvailable) blockers.push("Gerçek zamanlı hacim doğrulanamadı");

  let verdict;
  if (market === "OPTION") {
    verdict = VERDICTS.NO_DATA;
  } else if (dataHealth < 45) {
    verdict = VERDICTS.NO_DATA;
  } else if (blockers.some((reason) => /eski|sağlığı|düşüş|Oynaklık/u.test(reason)) || score < 52) {
    verdict = VERDICTS.AVOID;
  } else if (overextended || !currentEntryValid || (setups.length === 0 && score >= 58)) {
    verdict = VERDICTS.WAIT;
  } else if (
    score >= 84 && dataHealth >= 85 && setups.length >= 1 && effectiveRewardRisk >= 1.8 &&
    hourBullish && fourHourBullish && dailyBullish && volumePass && confirmed && fresh
  ) {
    verdict = VERDICTS.INVEST;
  } else if (
    score >= 68 && dataHealth >= 60 && setups.length >= 1 && effectiveRewardRisk >= 1.45 &&
    hourBullish && confirmed && fresh
  ) {
    verdict = VERDICTS.OPTIONAL;
  } else {
    verdict = score >= 58 && !hardBearish ? VERDICTS.WAIT : VERDICTS.AVOID;
  }

  const reasons = factors.filter((factor) => factor.passed).sort((a, b) => b.weight - a.weight).slice(0, 5).map((factor) => factor.label);
  const failed = factors.filter((factor) => !factor.passed).sort((a, b) => b.weight - a.weight).slice(0, 5).map((factor) => factor.label);

  return {
    id: String(input.signalId ?? `${input.symbol ?? "UNKNOWN"}-${now.getTime()}`),
    symbol: cleanSymbol(input.symbol),
    exchange: cleanText(input.exchange, 24),
    market,
    timeframe: cleanText(input.timeframe ?? "15", 8),
    analyzedAt: now.toISOString(),
    barTime: sentAt?.toISOString() ?? now.toISOString(),
    verdict,
    verdictCode: verdictCode(verdict),
    score,
    dataHealth,
    setup: setupLabel(primarySetup),
    setupCode: primarySetup,
    directions: {
      intraday: bias(emaAligned && aboveVwap, hardBearish),
      oneDay: bias(dailyBullish, m.dailyBearish === true),
      oneWeek: bias(weeklyBullish, m.weeklyBearish === true)
    },
    plan,
    reasons,
    failed,
    blockers: unique([...dataWarnings, ...blockers]),
    factors,
    metrics: {
      price: round(m.price), atr: round(m.atr), atrPercent: round(atrPercent), rsi: round(m.rsi, 1),
      adx: round(m.adx, 1), relativeVolume: round(m.relativeVolume), distanceVwapAtr: round(distanceVwapAtr)
    },
    evidence: { observedAccuracy: null, sampleSize: 0, label: "Canlı kanıt henüz hesaplanmadı" },
    disclaimer: "Bu sonuç bir analiz sınıflandırmasıdır; kâr garantisi veya kişisel yatırım danışmanlığı değildir."
  };
}

export function computeEvidence(outcomes) {
  const closed = outcomes.filter((item) => ["TARGET1", "TARGET2", "STOP", "INVALIDATED", "EXPIRED"].includes(item.result));
  const wins = closed.filter((item) => item.result === "TARGET1" || item.result === "TARGET2").length;
  const sampleSize = closed.length;
  if (sampleSize === 0) return { sampleSize: 0, wins: 0, observedAccuracy: null, interval: null, grade: "KANIT YOK" };
  const observedAccuracy = wins / sampleSize;
  return {
    sampleSize,
    wins,
    observedAccuracy: round(observedAccuracy * 100, 1),
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

function noDataResult(input, market, dataHealth, blockers, now) {
  return {
    id: String(input.signalId ?? `${input.symbol ?? "UNKNOWN"}-${now.getTime()}`),
    symbol: cleanSymbol(input.symbol), exchange: cleanText(input.exchange, 24), market,
    timeframe: cleanText(input.timeframe ?? "15", 8), analyzedAt: now.toISOString(), barTime: input.sentAt ?? now.toISOString(),
    verdict: VERDICTS.NO_DATA, verdictCode: -1, score: 0, dataHealth, setup: "Kurulum yok", setupCode: "none",
    directions: { intraday: "BELİRSİZ", oneDay: "BELİRSİZ", oneWeek: "BELİRSİZ" }, plan: null,
    reasons: [], failed: [], blockers: unique(blockers), factors: [], metrics: {},
    evidence: { observedAccuracy: null, sampleSize: 0, label: "Veri yetersiz" },
    disclaimer: "Eksik veya güncel olmayan veriyle işlem kararı üretilmedi."
  };
}

function buildPlan(m, setup) {
  let entryMid;
  if (setup === "breakout" || setup === "retest") entryMid = m.previousHigh > 0 ? m.previousHigh : m.price;
  else entryMid = Math.max(m.vwap > 0 ? m.vwap : m.ema21, m.ema21 > 0 ? m.ema21 : m.price);
  if (!Number.isFinite(entryMid) || entryMid <= 0) entryMid = m.price;
  const entryLow = entryMid - m.atr * 0.16;
  const entryHigh = entryMid + m.atr * 0.18;
  const atrStop = entryMid - m.atr * 1.3;
  const structureStop = m.swingLow > 0 && m.swingLow < entryMid ? m.swingLow - m.atr * 0.12 : atrStop;
  const rawDistance = entryMid - Math.min(atrStop, structureStop);
  const stopDistance = clamp(rawDistance, m.atr * 0.85, m.atr * 2.2);
  const stop = entryMid - stopDistance;
  return {
    entryLow: round(entryLow), entryHigh: round(entryHigh), entryMid: round(entryMid),
    maximumChase: round(entryHigh + m.atr * 0.28), stop: round(stop),
    target1: round(entryMid + stopDistance * 1.5), target2: round(entryMid + stopDistance * 2.5),
    invalidation: `15 dk kapanış ${round(stop)} altında`, validity: "4 adet 15 dk mum veya seans sonu",
    effectiveRewardRisk: 0, quantityPer100k: 0
  };
}

function sanitizeMetrics(raw) {
  const number = (name) => finite(raw[name]);
  return {
    price: number("price"), open: number("open"), high: number("high"), low: number("low"), volume: number("volume"),
    averageVolume: number("averageVolume"), ema9: number("ema9"), ema21: number("ema21"), ema50: number("ema50"),
    vwap: number("vwap"), atr: number("atr"), atrPercent: number("atrPercent"), rsi: number("rsi"), adx: number("adx"),
    macdHistogram: number("macdHistogram"), relativeVolume: number("relativeVolume"), previousHigh: number("previousHigh"),
    swingLow: number("swingLow"), relativeStrength20: number("relativeStrength20"),
    hourBullish: booleanOrNull(raw.hourBullish), fourHourBullish: booleanOrNull(raw.fourHourBullish),
    dailyBullish: booleanOrNull(raw.dailyBullish), weeklyBullish: booleanOrNull(raw.weeklyBullish),
    dailyBearish: booleanOrNull(raw.dailyBearish), weeklyBearish: booleanOrNull(raw.weeklyBearish),
    benchmarkBullish: booleanOrNull(raw.benchmarkBullish),
    hourTrendKnown: typeof raw.hourBullish === "boolean", fourHourTrendKnown: typeof raw.fourHourBullish === "boolean"
  };
}

function selectSetup(flags) {
  if (flags.retest) return "retest";
  if (flags.breakout) return "breakout";
  if (flags.trendPullback) return "trendPullback";
  if (flags.relativeLeader) return "relativeLeader";
  return "none";
}

function setupLabel(value) {
  return ({ retest: "Kırılım yeniden testi", breakout: "Hacimli kırılım", trendPullback: "Trend geri çekilmesi", relativeLeader: "Göreli güçlü lider", none: "Kurulum yok" })[value] ?? "Kurulum yok";
}

function addFactor(list, label, passed, weight, actual, required) { list.push({ label, passed: Boolean(passed), weight, actual, required }); }
function bias(bullish, bearish) { return bullish ? "YÜKSELİŞ" : bearish ? "DÜŞÜŞ" : "YATAY/BELİRSİZ"; }
function direction(value) { return value === true ? "Yükseliş" : value === false ? "Düşüş" : "Bilinmiyor"; }
function formatTriple(a, b, c) { return `${round(a)} / ${round(b)} / ${round(c)}`; }
function verdictCode(verdict) { return verdict === VERDICTS.INVEST ? 3 : verdict === VERDICTS.OPTIONAL ? 2 : verdict === VERDICTS.WAIT ? 1 : verdict === VERDICTS.AVOID ? 0 : -1; }
function normalizeMarket(value) {
  const normalized = String(value ?? "OTHER").trim().toUpperCase();
  const aliases = { STOCKS: "STOCK", FUND: "ETF", CRYPTOCURRENCY: "CRYPTO", FX: "FOREX", CFD: "COMMODITY" };
  const resolved = aliases[normalized] ?? normalized;
  return MARKET_PROFILES[resolved] ? resolved : "OTHER";
}
function finite(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function booleanOrNull(value) { return typeof value === "boolean" ? value : null; }
function parseDate(value) { const date = new Date(String(value ?? "")); return Number.isFinite(date.getTime()) ? date : null; }
function cleanSymbol(value) { return String(value ?? "UNKNOWN").replace(/[^A-Za-z0-9_.:\-/]/gu, "").slice(0, 48) || "UNKNOWN"; }
function cleanText(value, max) { return String(value ?? "").replace(/[\u0000-\u001F\u007F]/gu, "").slice(0, max); }
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function clamp(value, minimum, maximum) { return Math.min(maximum, Math.max(minimum, value)); }
function round(value, digits = 2) { const multiplier = 10 ** digits; return Math.round((Number(value) + Number.EPSILON) * multiplier) / multiplier; }

export { VERDICTS, MARKET_PROFILES };
