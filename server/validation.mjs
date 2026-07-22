import { timingSafeEqual } from "node:crypto";

const OUTCOMES = new Set(["TARGET1", "TARGET2", "STOP", "INVALIDATED", "EXPIRED"]);

export class RequestError extends Error {
  constructor(status, message, code = "INVALID_REQUEST") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function authenticateWebhook(received, expected) {
  const a = Buffer.from(String(received ?? ""), "utf8");
  const b = Buffer.from(String(expected ?? ""), "utf8");
  if (a.length !== b.length || a.length < 32 || !timingSafeEqual(a, b)) {
    throw new RequestError(401, "Webhook anahtarı geçersiz", "UNAUTHORIZED");
  }
}

export function validateAnalysisPayload(value) {
  const body = object(value, "JSON nesnesi bekleniyor");
  if (body.event && body.event !== "ANALYSIS") throw new RequestError(422, "event ANALYSIS olmalı");
  const signalId = text(body.signalId, "signalId", 96);
  const symbol = text(body.symbol, "symbol", 48);
  const sentAt = isoDate(body.sentAt, "sentAt");
  const metrics = object(body.metrics, "metrics nesnesi gerekli");
  const data = body.data == null ? {} : object(body.data, "data nesne olmalı");
  return {
    version: text(body.version ?? "2.0", "version", 12),
    event: "ANALYSIS",
    signalId,
    nonce: text(body.nonce ?? signalId, "nonce", 128),
    symbol,
    exchange: optionalText(body.exchange, 24),
    marketType: optionalText(body.marketType ?? "OTHER", 24),
    timeframe: optionalText(body.timeframe ?? "15", 8),
    barTime: body.barTime ? isoDate(body.barTime, "barTime").toISOString() : sentAt.toISOString(),
    sentAt: sentAt.toISOString(),
    confirmed: body.confirmed === true,
    data: {
      fresh: data.fresh !== false,
      volumeAvailable: data.volumeAvailable === true,
      enoughHistory: data.enoughHistory !== false
    },
    metrics: sanitizeMetrics(metrics)
  };
}

export function validateOutcomePayload(value) {
  const body = object(value, "JSON nesnesi bekleniyor");
  const signalId = text(body.signalId, "signalId", 96);
  const result = text(body.result, "result", 24).toUpperCase();
  if (!OUTCOMES.has(result)) throw new RequestError(422, "Geçersiz sonuç türü");
  const observedAt = isoDate(body.observedAt ?? body.sentAt, "observedAt");
  return {
    event: "OUTCOME",
    signalId,
    nonce: text(body.nonce ?? `${signalId}-${result}-${observedAt.toISOString()}`, "nonce", 160),
    result,
    observedAt: observedAt.toISOString(),
    finalReturnPct: optionalNumber(body.finalReturnPct)
  };
}

export function assertRecent(iso, maximumAgeSeconds, now = new Date()) {
  const time = Date.parse(iso);
  const delta = Math.abs(now.getTime() - time) / 1000;
  if (!Number.isFinite(delta) || delta > maximumAgeSeconds) {
    throw new RequestError(422, "Sinyal zaman aşımına uğramış veya saati geçersiz", "STALE_SIGNAL");
  }
}

function sanitizeMetrics(metrics) {
  const numericFields = [
    "price", "open", "high", "low", "volume", "averageVolume", "ema9", "ema21", "ema50", "vwap", "atr",
    "atrPercent", "rsi", "adx", "macdHistogram", "relativeVolume", "previousHigh", "swingLow", "relativeStrength20"
  ];
  const booleanFields = ["hourBullish", "fourHourBullish", "dailyBullish", "weeklyBullish", "dailyBearish", "weeklyBearish", "benchmarkBullish"];
  const output = {};
  for (const field of numericFields) output[field] = optionalNumber(metrics[field]) ?? 0;
  for (const field of booleanFields) output[field] = typeof metrics[field] === "boolean" ? metrics[field] : null;
  return output;
}

function object(value, message) { if (!value || typeof value !== "object" || Array.isArray(value)) throw new RequestError(422, message); return value; }
function text(value, name, max) { const result = String(value ?? "").trim(); if (!result || result.length > max) throw new RequestError(422, `${name} eksik veya çok uzun`); return result; }
function optionalText(value, max) { return String(value ?? "").trim().slice(0, max); }
function isoDate(value, name) { const date = new Date(String(value ?? "")); if (!Number.isFinite(date.getTime())) throw new RequestError(422, `${name} geçersiz`); return date; }
function optionalNumber(value) { if (value == null || value === "") return null; const number = Number(value); if (!Number.isFinite(number)) throw new RequestError(422, "Sayısal alan geçersiz"); return number; }
