import test from "node:test";
import assert from "node:assert/strict";
import { analyzeBundle, computeEvidence, VERDICTS, wilsonInterval } from "../lib/engine.js";
import { makeBars, makeBundle, NOW } from "./helpers.mjs";

test("a fully aligned pullback can genuinely produce YATIR", () => {
  const intervals = {
    fifteen: 15 * 60_000,
    hour: 60 * 60_000,
    fourHour: 4 * 60 * 60_000,
    day: 24 * 60 * 60_000
  };
  const bundle = {
    requestedSymbol: "BIST:STRONG",
    provider: "YAHOO",
    providerSymbol: "STRONG.IS",
    market: "STOCK",
    exchange: "BIST",
    ticker: "STRONG",
    intervals,
    meta: { marketOpen: true },
    frames: {
      fifteen: makeBars({ count: 392, intervalMs: intervals.fifteen, drift: 0.00005, amplitude: 0.0028 }),
      hour: makeBars({ count: 392, intervalMs: intervals.hour, drift: 0.00011, amplitude: 0.003 }),
      fourHour: makeBars({ count: 392, intervalMs: intervals.fourHour, drift: 0.000165, amplitude: 0.004 }),
      day: makeBars({ count: 392, intervalMs: intervals.day, drift: 0.000225, amplitude: 0.006 })
    }
  };
  const result = analyzeBundle(bundle, NOW);
  assert.equal(result.verdict, VERDICTS.INVEST);
  assert.ok(result.technicalScore >= 82);
  assert.ok(result.plan.effectiveRewardRisk >= 1.8);
});

test("healthy bullish data yields a usable long-side classification", () => {
  const result = analyzeBundle(makeBundle(), NOW);
  assert.ok([VERDICTS.INVEST, VERDICTS.OPTIONAL, VERDICTS.WAIT].includes(result.verdict));
  assert.equal(result.directions.oneDay, "YÜKSELİŞ");
  assert.ok(result.plan);
  assert.ok(result.plan.stop < result.plan.entryMid);
  assert.ok(result.plan.target2 > result.plan.target1);
});

test("intraday and 1–5 day decisions are calculated as independent horizons", () => {
  const result = analyzeBundle(makeBundle(), NOW);
  assert.equal(result.freeMode, true);
  assert.equal(result.horizons.intraday.horizon, "INTRADAY");
  assert.equal(result.horizons.swing.horizon, "SWING");
  assert.match(result.horizons.intraday.decisionLabel, /15 DK/u);
  assert.match(result.horizons.swing.decisionLabel, /1–5 GÜN/u);
  assert.match(result.horizons.intraday.plan.validity, /15 dk/u);
  assert.match(result.horizons.swing.plan.validity, /5 işlem günü/u);
  assert.notEqual(result.horizons.intraday.id, result.horizons.swing.id);
});

test("each horizon exposes a regime-aware strategy tournament", () => {
  const result = analyzeBundle(makeBundle(), NOW);
  for (const decision of Object.values(result.horizons)) {
    assert.ok(decision.regime?.label);
    assert.ok(decision.strategyTournament?.candidates?.length >= 4);
    assert.equal(decision.strategyTournament.selectedCode, decision.setupCode);
    assert.ok(decision.strategyTournament.candidates.every((item) => item.score >= 0 && item.score <= 100));
  }
});

test("stale data fails closed", () => {
  const result = analyzeBundle(makeBundle({ stale: true, marketOpen: true }), NOW);
  assert.equal(result.verdict, VERDICTS.NO_DATA);
  assert.ok(result.blockers.some((reason) => reason.includes("eski")));
});

test("missing mandatory volume cannot produce YATIR", () => {
  const result = analyzeBundle(makeBundle({ volume: false }), NOW);
  assert.notEqual(result.verdict, VERDICTS.INVEST);
  assert.ok(result.blockers.some((reason) => reason.includes("hacim")));
});

test("bearish stock data becomes a decline warning when shortability is not verified", () => {
  const result = analyzeBundle(makeBundle({ bearish: true }), NOW);
  assert.equal(result.verdict, VERDICTS.DECLINE);
  assert.equal(result.directions.oneDay, "DÜŞÜŞ");
  assert.equal(result.tradeSide, "SHORT");
  assert.equal(result.execution.actionable, false);
  assert.ok(result.plan.stop > result.plan.entryMid);
  assert.ok(result.plan.target2 < result.plan.target1);
});

test("bearish two-way market data can produce a confirmed SHORT plan", () => {
  const bundle = makeBundle({ bearish: true, market: "FOREX" });
  bundle.exchange = "FX_IDC";
  bundle.ticker = "EURUSD";
  bundle.requestedSymbol = "FX_IDC:EURUSD";
  const result = analyzeBundle(bundle, NOW);
  assert.equal(result.verdict, VERDICTS.SHORT);
  assert.equal(result.tradeSide, "SHORT");
  assert.equal(result.execution.actionable, true);
  assert.ok(result.plan.stop > result.plan.entryMid);
  assert.ok(result.plan.target2 < result.plan.target1);
});

test("malformed bundle yields VERİ YETERSİZ instead of throwing", () => {
  const result = analyzeBundle({ requestedSymbol: "BIST:BAD" }, NOW);
  assert.equal(result.verdict, VERDICTS.NO_DATA);
  assert.equal(result.plan, null);
});

test("evidence uses only closed outcomes and reports Wilson interval", () => {
  const outcomes = [
    ...Array.from({ length: 8 }, () => ({ result: "TARGET1" })),
    ...Array.from({ length: 2 }, () => ({ result: "STOP" })),
    { result: "OPEN" }
  ];
  const evidence = computeEvidence(outcomes);
  assert.equal(evidence.sampleSize, 10);
  assert.equal(evidence.observedAccuracy, 80);
  assert.deepEqual(evidence.interval, wilsonInterval(8, 10));
  assert.ok(evidence.interval[0] < 80 && evidence.interval[1] > 80);
});

test("evidence keeps LONG and SHORT forward results separate", () => {
  const evidence = computeEvidence([
    { side: "LONG", result: "TARGET1" },
    { side: "LONG", result: "STOP" },
    { side: "SHORT", result: "TARGET2" }
  ]);
  assert.equal(evidence.bySide.LONG.sampleSize, 2);
  assert.equal(evidence.bySide.LONG.observedAccuracy, 50);
  assert.equal(evidence.bySide.SHORT.sampleSize, 1);
  assert.equal(evidence.bySide.SHORT.observedAccuracy, 100);
});

test("evidence separates horizons and ignores plans that never entered", () => {
  const evidence = computeEvidence([
    { side: "LONG", horizon: "INTRADAY", result: "TARGET2", realizedR: 2.5 },
    { side: "LONG", horizon: "SWING", result: "STOP", realizedR: -1 },
    { side: "LONG", horizon: "SWING", result: "NO_ENTRY", realizedR: 0 }
  ]);
  assert.equal(evidence.sampleSize, 2);
  assert.equal(evidence.byHorizon.INTRADAY.sampleSize, 1);
  assert.equal(evidence.byHorizon.SWING.sampleSize, 1);
  assert.equal(evidence.expectancyR, 0.75);
});
