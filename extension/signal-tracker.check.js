const assert = require("node:assert/strict");
const tracker = require("./signal-tracker.js");

const firstAt = new Date("2026-07-16T08:00:00Z");
const signal = (market, symbol, entry, stop, target1, target2) => ({
  market,
  marketLabel: market === "crypto" ? "KRİPTO" : "BIST",
  symbol,
  displaySymbol: symbol.replace("USDT", ""),
  eligible: true,
  dataDate: firstAt.toISOString(),
  price: entry,
  strategy: { id: "trend", label: "Trend devamı" },
  orderPlan: { limitBuy: entry, stopTrigger: stop, target1, target2, validUntil: "2026-07-20" },
});
const snapshot = (market, symbol, dataDate, currentBar, eligible = true) => ({ market, symbol, dataDate, price: currentBar.close, currentBar, eligible });

const initial = tracker.updateHistory(null, {
  recommendations: [signal("bist", "THYAO", 300, 290, 315, 322), signal("crypto", "BTCUSDT", 100, 95, 107.5, 111)],
  snapshot: [],
}, firstAt);
assert.equal(initial.version, 3);
assert.equal(initial.records.length, 2);
assert.equal(initial.stats.open, 2);
assert.equal(initial.stats.pending, 2);

const second = tracker.updateHistory(initial, {
  recommendations: [],
  snapshot: [
    snapshot("bist", "THYAO", "2026-07-17T16:00:00Z", { open: 302, high: 316, low: 299, close: 314 }),
    snapshot("crypto", "BTCUSDT", "2026-07-17T08:00:00Z", { open: 100, high: 101, low: 94, close: 96 }),
  ],
}, new Date("2026-07-17T17:00:00Z"));
assert.equal(second.stats.resolved, 1);
assert.equal(second.stats.losses, 1);
assert.equal(second.stats.movedStop, 1);
assert.ok(second.records.some((item) => item.status === "TAŞINAN STOP" && item.currentStop === item.fillPrice));
assert.ok(second.records.some((item) => item.status === "STOP" && item.resultR === -1));

// On the next bar both the moved stop and target 2 are visible. The conservative rule takes the stop first.
const third = tracker.updateHistory(second, {
  recommendations: [],
  snapshot: [snapshot("bist", "THYAO", "2026-07-20T16:00:00Z", { open: 314, high: 324, low: 299, close: 320 })],
}, new Date("2026-07-20T17:00:00Z"));
assert.equal(third.stats.resolved, 2);
assert.equal(third.stats.wins, 1);
assert.equal(third.stats.losses, 1);
assert.equal(third.stats.winRate, 50);
assert.ok(third.records.some((item) => item.status === "STOP" && item.outcome === "TAŞINAN STOP" && item.resultR === 0.75));

const duplicateGuard = tracker.updateHistory(third, { recommendations: [signal("bist", "THYAO", 300, 290, 315, 322)], snapshot: [] }, new Date("2026-07-20T18:00:00Z"));
assert.equal(duplicateGuard.records.length, 2);

const pendingSignal = tracker.updateHistory(null, { recommendations: [signal("bist", "ASELS", 100, 95, 108, 112)], snapshot: [] }, firstAt);
const invalidated = tracker.updateHistory(pendingSignal, {
  recommendations: [],
  snapshot: [snapshot("bist", "ASELS", "2026-07-17T16:00:00Z", { open: 106, high: 107, low: 104, close: 105 }, false)],
}, new Date("2026-07-17T17:00:00Z"));
assert.equal(invalidated.records[0].status, "KURULUM BOZULDU");
assert.equal(invalidated.stats.cancelled, 1);

const losingHistory = { records: Array.from({ length: 12 }, (_, index) => ({ id: `loss-${index}`, market: "bist", strategyId: "trend", status: "STOP", resultR: -1 })) };
const guard = tracker.performanceGuard(losingHistory);
assert.equal(guard.summaries["bist:trend"].ready, true);
assert.equal(guard.summaries["bist:trend"].passed, false);
const guarded = tracker.applyPerformanceGuard({ candidateCount: 1, marketDecision: "YATIR · 1 hisse", recommendations: [{ market: "bist", symbol: "ASELS", eligible: true, preEligible: true, action: "YATIR", rankScore: 80, strategy: { id: "trend", label: "Trend devamı" }, gates: {}, failedGates: [], reasons: [] }], snapshot: [{ market: "bist", symbol: "ASELS", eligible: true }] }, losingHistory);
assert.equal(guarded.candidateCount, 0);
assert.equal(guarded.recommendations[0].gates.performance, false);
assert.ok(guarded.recommendations[0].failedGates.some((gate) => gate.key === "performance"));
console.log("FinPilot signal tracker checks: OK");
