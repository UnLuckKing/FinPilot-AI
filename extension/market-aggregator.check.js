const assert = require("node:assert/strict");
const aggregator = require("./market-aggregator.js");

const now = new Date("2026-07-16T12:00:00Z");
const bist = { generatedAt: now.toISOString(), dataAsOf: "2026-07-15", scannedCount: 100, requestedCount: 120, errorCount: 2, candidateCount: 1, marketDecision: "YATIR · 1 hisse", marketRegime: { gateOpen: true, dataSufficient: true, breadthPct: 55 }, recommendations: [{ market: "bist", symbol: "THYAO", eligible: true, rankScore: 82 }], snapshot: [{ market: "bist", symbol: "THYAO", price: 300 }], errors: [], research: { kapCheckedCount: 12, deepResearchLimit: 12 } };
const crypto = { generatedAt: now.toISOString(), dataAsOf: "2026-07-16T11:59:00Z", scannedCount: 130, requestedCount: 140, errorCount: 1, candidateCount: 0, marketDecision: "YATIRMA", marketRegime: { gateOpen: true, dataSufficient: true, breadthPct: 45 }, recommendations: [{ market: "crypto", symbol: "BTCUSDT", eligible: false, nearMiss: true, rankScore: 75 }], snapshot: [{ market: "crypto", symbol: "BTCUSDT", price: 118000 }], errors: [{ symbol: "X", message: "test" }] };
const result = aggregator.combineResults(bist, crypto, now);
assert.equal(result.version, 6);
assert.equal(result.scannedCount, 230);
assert.equal(result.requestedCount, 260);
assert.equal(result.candidateCount, 1);
assert.equal(result.recommendations[0].symbol, "THYAO");
assert.equal(result.recommendations[1].symbol, "BTCUSDT");
assert.equal(result.snapshot.length, 2);
assert.equal(result.research.kapCheckedCount, 12);
console.log("FinPilot market aggregator checks: OK");
