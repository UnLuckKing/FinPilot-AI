import test from "node:test";
import assert from "node:assert/strict";
import { adx, atr, closedBars, ema, frameSnapshot, normalizeBars, resampleBars, rsi } from "../lib/indicators.js";
import { makeBars, NOW } from "./helpers.mjs";

test("indicators produce finite values from valid bars", () => {
  const bars = makeBars();
  const closes = bars.map((bar) => bar.close);
  assert.ok(ema(closes, 21) > 0);
  assert.ok(atr(bars, 14) > 0);
  assert.ok(rsi(closes, 14) >= 0 && rsi(closes, 14) <= 100);
  assert.ok(adx(bars, 14) >= 0 && adx(bars, 14) <= 100);
  const snapshot = frameSnapshot(bars);
  assert.ok(snapshot);
  assert.ok(Number.isFinite(snapshot.trendScore));
});

test("invalid and duplicate bars are removed", () => {
  const bars = makeBars({ count: 5 });
  const duplicate = { ...bars[0], close: bars[0].close + 0.01 };
  const invalid = { time: 1, open: 5, high: 4, low: 3, close: 5, volume: 1 };
  const normalized = normalizeBars([...bars, duplicate, invalid]);
  assert.equal(normalized.length, 5);
  assert.equal(normalized[0].close, duplicate.close);
});

test("only closed candles are used", () => {
  const interval = 15 * 60_000;
  const bars = makeBars({ count: 5, intervalMs: interval });
  bars.push({ ...bars.at(-1), time: NOW - 5 * 60_000 });
  const closed = closedBars(bars, interval, NOW);
  assert.ok(closed.every((bar) => bar.time + interval <= NOW - 2_000));
});

test("hour bars resample into four-hour bars", () => {
  const bars = makeBars({ count: 16, intervalMs: 60 * 60_000 });
  const sampled = resampleBars(bars, 4 * 60 * 60_000);
  assert.ok(sampled.length >= 4 && sampled.length <= 5);
  assert.ok(sampled.every((bar) => bar.high >= bar.low));
});
