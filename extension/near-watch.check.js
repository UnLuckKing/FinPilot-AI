const assert = require("node:assert/strict");
const watch = require("./near-watch.js");

const candidate = (distance, eligible = false) => ({
  market: "bist",
  marketLabel: "BIST",
  symbol: "THYAO",
  displaySymbol: "THYAO",
  eligible,
  nearMiss: !eligible,
  distanceToEligible: distance,
  rankScore: 77,
  strategy: { id: "pullback", label: "Geri çekilme" },
  failedGates: Array.from({ length: distance }, (_, index) => ({ key: `g${index}`, label: `Kapı ${index}`, message: `Kapı ${index} geçmedi.` })),
});

const first = watch.updateWatch(null, { recommendations: [candidate(3)] }, new Date("2026-07-16T08:00:00Z"));
assert.equal(first.count, 1);
assert.equal(first.improvements.length, 0);
const second = watch.updateWatch(first, { recommendations: [candidate(1)] }, new Date("2026-07-16T12:00:00Z"));
assert.equal(second.items[0].improved, true);
assert.equal(second.improvements[0].from, 3);
assert.equal(second.improvements[0].to, 1);
const promoted = watch.updateWatch(second, { recommendations: [candidate(0, true)] }, new Date("2026-07-16T16:00:00Z"));
assert.equal(promoted.items.length, 0);
assert.equal(promoted.improvements[0].kind, "eligible");
const attached = watch.attachToResult({ recommendations: [candidate(1)], research: {} }, second);
assert.equal(attached.recommendations[0].autoWatched, true);
assert.equal(attached.research.nearWatchCount, 1);
console.log("FinPilot near-watch checks: OK");
