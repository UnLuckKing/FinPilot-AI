import test from "node:test";
import assert from "node:assert/strict";
import { evaluatePlanB, quantityForRisk } from "../lib/risk.js";

const NOW = Date.parse("2026-07-24T12:00:00.000Z");
const decision = {
  symbol: "BIST:TEST",
  horizon: "INTRADAY",
  setup: "Trend geri çekilmesi",
  setupCode: "trendPullback"
};

test("Plan B blocks an immediate repeat of the same stopped setup", () => {
  const planB = evaluatePlanB(decision, [{
    symbol: "BIST:TEST",
    horizon: "INTRADAY",
    setupCode: "trendPullback",
    result: "STOP",
    realizedR: -1,
    closedAt: new Date(NOW - 20 * 60_000).toISOString()
  }], NOW);
  assert.equal(planB.allowNew, false);
  assert.equal(planB.status, "STOP SONRASI SOĞUMA");
  assert.ok(planB.cooldownMinutes >= 39);
});

test("two older consecutive losses reduce risk without martingale", () => {
  const outcomes = [70, 140].map((minutes) => ({
    symbol: "BIST:TEST",
    horizon: "INTRADAY",
    setupCode: "breakout",
    result: "STOP",
    realizedR: -1,
    closedAt: new Date(NOW - minutes * 60_000).toISOString()
  }));
  const planB = evaluatePlanB(decision, outcomes, NOW);
  assert.equal(planB.allowNew, true);
  assert.equal(planB.riskPercent, 0.25);
  assert.equal(planB.status, "RİSK AZALTILDI");
});

test("position quantity follows the reduced risk budget", () => {
  const plan = { entryMid: 100, stop: 95 };
  assert.equal(quantityForRisk(plan, 0.5, 100_000), 100);
  assert.equal(quantityForRisk(plan, 0.25, 100_000), 50);
});

test("a consistently negative model is quarantined after enough paper trades", () => {
  const outcomes = Array.from({ length: 12 }, (_, index) => ({
    symbol: `BIST:T${index}`,
    horizon: "INTRADAY",
    setupCode: "trendPullback",
    result: index < 9 ? "STOP" : "BREAKEVEN",
    realizedR: index < 9 ? -1 : 0,
    closedAt: new Date(NOW - (index + 2) * 60 * 60_000).toISOString()
  }));
  const planB = evaluatePlanB(decision, outcomes, NOW);
  assert.equal(planB.allowNew, false);
  assert.equal(planB.status, "MODEL KARANTİNADA");
});
