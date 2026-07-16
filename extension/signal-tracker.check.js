const assert = require("node:assert/strict");
const tracker = require("./signal-tracker.js");

const firstAt = new Date("2026-07-16T08:00:00Z");
const signal = (market, symbol, entry, stop, target1, target2) => ({ market, marketLabel: market === "crypto" ? "KRİPTO" : "BIST", symbol, displaySymbol: symbol.replace("USDT", ""), eligible: true, dataDate: firstAt.toISOString(), price: entry, orderPlan: { limitBuy: entry, stopTrigger: stop, target1, target2, validUntil: "2026-07-20" } });
const initial = tracker.updateHistory(null, { recommendations: [signal("bist", "THYAO", 300, 290, 315, 322), signal("crypto", "BTCUSDT", 100, 95, 107.5, 111)], snapshot: [] }, firstAt);
assert.equal(initial.records.length, 2);
assert.equal(initial.stats.open, 2);

const second = tracker.updateHistory(initial, { recommendations: [], snapshot: [{ market: "bist", symbol: "THYAO", price: 316 }, { market: "crypto", symbol: "BTCUSDT", price: 94 }] }, new Date("2026-07-17T08:00:00Z"));
assert.equal(second.stats.resolved, 2);
assert.equal(second.stats.wins, 1);
assert.equal(second.stats.losses, 1);
assert.equal(second.stats.winRate, 50);
assert.ok(second.records.some((item) => item.status === "HEDEF 1"));
assert.ok(second.records.some((item) => item.status === "STOP"));
const duplicateGuard = tracker.updateHistory(second, { recommendations: [signal("bist", "THYAO", 300, 290, 315, 322)], snapshot: [] }, new Date("2026-07-17T12:00:00Z"));
assert.equal(duplicateGuard.records.length, 2);
console.log("FinPilot signal tracker checks: OK");
