import { isTradeOutcome } from "./lifecycle.js";

const BASE_RISK_PERCENT = 0.5;

export function evaluatePlanB(decision, outcomes, nowMs = Date.now()) {
  const source = Array.isArray(outcomes) ? outcomes.filter(isTradeOutcome) : [];
  const horizon = decision?.horizon ?? "INTRADAY";
  const symbol = String(decision?.symbol ?? "");
  const setupCode = String(decision?.setupCode ?? "none");
  const relevant = source
    .filter((item) =>
      String(item.symbol ?? "") === symbol &&
      String(item.horizon ?? "INTRADAY") === horizon
    )
    .sort(byClosedTime);
  const sameModel = source.filter((item) =>
    String(item.horizon ?? "INTRADAY") === horizon &&
    String(item.setupCode ?? "none") === setupCode
  );

  const consecutiveLosses = countConsecutiveLosses(relevant);
  const last = relevant[0];
  const cooldownMs = horizon === "SWING" ? 24 * 60 * 60_000 : 60 * 60_000;
  const lastClosedAt = Date.parse(last?.closedAt);
  const cooldownActive = last?.result === "STOP" &&
    last?.setupCode === setupCode &&
    Number.isFinite(lastClosedAt) &&
    nowMs - lastClosedAt < cooldownMs;
  const remainingMinutes = cooldownActive
    ? Math.max(1, Math.ceil((cooldownMs - (nowMs - lastClosedAt)) / 60_000))
    : 0;

  const modelHealth = summarizeModel(sameModel);
  const quarantined = modelHealth.sampleSize >= 12 &&
    (modelHealth.expectancyR < -0.1 || modelHealth.stopRate >= 65);
  const riskPercent = consecutiveLosses >= 2
    ? 0.25
    : consecutiveLosses === 1
      ? 0.35
      : BASE_RISK_PERCENT;

  if (quarantined) {
    return {
      allowNew: false,
      status: "MODEL KARANTİNADA",
      reason: `${decision.setup ?? "Seçili model"} son ${modelHealth.sampleSize} işlemde ${formatR(modelHealth.expectancyR)} beklenti üretti`,
      riskPercent: 0,
      consecutiveLosses,
      cooldownMinutes: 0,
      modelHealth
    };
  }
  if (cooldownActive) {
    return {
      allowNew: false,
      status: "STOP SONRASI SOĞUMA",
      reason: `Aynı ${decision.setup ?? "kurulum"} için ${remainingMinutes} dakika yeni giriş yok`,
      riskPercent: 0,
      consecutiveLosses,
      cooldownMinutes: remainingMinutes,
      modelHealth
    };
  }
  if (consecutiveLosses >= 2) {
    return {
      allowNew: true,
      status: "RİSK AZALTILDI",
      reason: "İki ardışık zarar nedeniyle sonraki planın örnek riski yarıya indirildi",
      riskPercent,
      consecutiveLosses,
      cooldownMinutes: 0,
      modelHealth
    };
  }
  if (consecutiveLosses === 1) {
    return {
      allowNew: true,
      status: "TEMKİNLİ DEVAM",
      reason: "Son stop nedeniyle örnek risk geçici olarak düşürüldü",
      riskPercent,
      consecutiveLosses,
      cooldownMinutes: 0,
      modelHealth
    };
  }
  return {
    allowNew: true,
    status: "NORMAL",
    reason: "Aynı sembol ve vadede etkin stop soğuması yok",
    riskPercent,
    consecutiveLosses,
    cooldownMinutes: 0,
    modelHealth
  };
}

export function quantityForRisk(plan, riskPercent, portfolio = 100_000) {
  const entry = Number(plan?.entryMid);
  const stop = Number(plan?.stop);
  const riskPerUnit = Math.abs(entry - stop);
  const riskBudget = Number(portfolio) * (Number(riskPercent) / 100);
  if (![riskPerUnit, riskBudget].every(Number.isFinite) || riskPerUnit <= 0 || riskBudget <= 0) return 0;
  return Math.max(0, Math.floor(riskBudget / riskPerUnit));
}

function summarizeModel(outcomes) {
  const closed = outcomes.filter(isTradeOutcome);
  if (closed.length === 0) {
    return { sampleSize: 0, expectancyR: null, stopRate: null, wins: 0, losses: 0 };
  }
  const realized = closed.map((item) => inferredR(item));
  const wins = realized.filter((value) => value > 0.05).length;
  const losses = realized.filter((value) => value < -0.05).length;
  const stops = closed.filter((item) => item.result === "STOP").length;
  return {
    sampleSize: closed.length,
    expectancyR: round(realized.reduce((sum, value) => sum + value, 0) / closed.length, 2),
    stopRate: round((stops / closed.length) * 100, 1),
    wins,
    losses
  };
}

function countConsecutiveLosses(outcomes) {
  let count = 0;
  for (const item of outcomes) {
    if (inferredR(item) >= -0.05) break;
    count += 1;
  }
  return count;
}

function inferredR(item) {
  const explicit = Number(item?.realizedR);
  if (Number.isFinite(explicit)) return explicit;
  if (item?.result === "TARGET2") return 2.5;
  if (item?.result === "TARGET1") return 1.5;
  if (item?.result === "STOP") return -1;
  return 0;
}

function byClosedTime(left, right) {
  return (Date.parse(right?.closedAt) || 0) - (Date.parse(left?.closedAt) || 0);
}

function formatR(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${numeric > 0 ? "+" : ""}${numeric.toFixed(2)}R` : "kanıtsız";
}

function round(value, digits = 2) {
  const multiplier = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * multiplier) / multiplier;
}
