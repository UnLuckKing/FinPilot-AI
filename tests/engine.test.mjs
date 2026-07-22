import test from "node:test";
import assert from "node:assert/strict";
import { analyzeMarket, computeEvidence, wilsonInterval } from "../server/engine.mjs";

const NOW = new Date("2026-07-23T10:00:00.000Z");

function signal(overrides = {}) {
  const metrics = {
    price: 105, open: 104.5, high: 105.3, low: 104.7, volume: 1_800_000, averageVolume: 1_000_000,
    ema9: 104, ema21: 103, ema50: 100, vwap: 104.5, atr: 2, atrPercent: 1.9, rsi: 62, adx: 28,
    macdHistogram: 0.8, relativeVolume: 1.8, previousHigh: 104.8, swingLow: 101, relativeStrength20: 0.03,
    hourBullish: true, fourHourBullish: true, dailyBullish: true, weeklyBullish: true,
    dailyBearish: false, weeklyBearish: false, benchmarkBullish: true,
    ...(overrides.metrics ?? {})
  };
  return {
    signalId: "BIST-TEST-1", symbol: "TEST", exchange: "BIST", marketType: "STOCK", timeframe: "15",
    sentAt: "2026-07-23T09:59:00.000Z", confirmed: true,
    data: { fresh: true, volumeAvailable: true, enoughHistory: true, ...(overrides.data ?? {}) },
    ...overrides,
    metrics
  };
}

test("güçlü, kapanmış ve veri sağlıklı kurulum YATIR üretebilir", () => {
  const result = analyzeMarket(signal(), NOW);
  assert.equal(result.verdict, "YATIR");
  assert.ok(result.score >= 84);
  assert.ok(result.plan.effectiveRewardRisk >= 1.8);
  assert.ok(result.plan.stop < result.plan.entryLow);
  assert.ok(result.plan.target1 > result.plan.entryHigh);
});

test("günlük teyit eksikse güçlü karar YATIRILABİLİR seviyesine düşer", () => {
  const result = analyzeMarket(signal({ metrics: { dailyBullish: false, dailyBearish: false } }), NOW);
  assert.equal(result.verdict, "YATIRILABİLİR — SEN BİLİRSİN");
});

test("zorunlu hacim yoksa YATIR üretmez", () => {
  const result = analyzeMarket(signal({ data: { volumeAvailable: false }, metrics: { volume: 0, averageVolume: 0, relativeVolume: 0 } }), NOW);
  assert.notEqual(result.verdict, "YATIR");
  assert.ok(result.blockers.some((reason) => reason.includes("hacim")));
});

test("aşırı uzamış fiyat BEKLE üretir", () => {
  const result = analyzeMarket(signal({ metrics: { price: 109, rsi: 76 } }), NOW);
  assert.equal(result.verdict, "BEKLE");
});

test("üst zaman dilimleri düşüşteyse YATIRMA üretir", () => {
  const result = analyzeMarket(signal({ metrics: { hourBullish: false, fourHourBullish: false, dailyBullish: false, dailyBearish: true, weeklyBullish: false, weeklyBearish: true } }), NOW);
  assert.equal(result.verdict, "YATIRMA");
});

test("geçersiz fiyatla plan uydurmaz", () => {
  const result = analyzeMarket(signal({ metrics: { price: 0, atr: 0 } }), NOW);
  assert.equal(result.verdict, "VERİ YETERSİZ");
  assert.equal(result.plan, null);
});

test("altı dakikadan eski veri güçlü karar üretemez", () => {
  const result = analyzeMarket(signal({ sentAt: "2026-07-23T09:50:00.000Z" }), NOW);
  assert.notEqual(result.verdict, "YATIR");
  assert.ok(result.blockers.includes("Analiz güncel değil"));
});

test("opsiyon verisi Greeks olmadan güçlü karar üretmez", () => {
  const result = analyzeMarket(signal({ marketType: "OPTION" }), NOW);
  assert.equal(result.verdict, "VERİ YETERSİZ");
  assert.ok(result.blockers.some((reason) => reason.includes("Opsiyon")));
});

test("kanıt oranı ve Wilson aralığı örnek sayısını açıkça korur", () => {
  const outcomes = Array.from({ length: 10 }, (_, index) => ({ result: index < 7 ? "TARGET1" : "STOP" }));
  const evidence = computeEvidence(outcomes);
  assert.equal(evidence.observedAccuracy, 70);
  assert.equal(evidence.sampleSize, 10);
  assert.equal(evidence.grade, "YETERSİZ");
  assert.deepEqual(evidence.interval, wilsonInterval(7, 10));
  assert.ok(evidence.interval[0] < 70 && evidence.interval[1] > 70);
});
