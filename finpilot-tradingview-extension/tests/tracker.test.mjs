import test from "node:test";
import assert from "node:assert/strict";
import { resolveCandidate } from "../lib/tracker.js";

const createdAt = "2026-07-23T10:00:00.000Z";
const candidate = {
  id: "TEST-1",
  symbol: "BIST:TEST",
  createdAt,
  expiresAt: "2026-07-23T11:00:00.000Z",
  plan: { stop: 95, target1: 105, target2: 110 }
};

test("same-bar stop/target ambiguity is resolved pessimistically", () => {
  const result = resolveCandidate(candidate, [{
    time: Date.parse(createdAt) + 15 * 60_000,
    open: 100,
    high: 111,
    low: 94,
    close: 106,
    volume: 1
  }], Date.parse("2026-07-23T10:20:00.000Z"));
  assert.equal(result.result, "STOP");
});

test("target and expiry results are recorded", () => {
  const target = resolveCandidate(candidate, [{
    time: Date.parse(createdAt) + 15 * 60_000,
    open: 100,
    high: 106,
    low: 99,
    close: 105,
    volume: 1
  }], Date.parse("2026-07-23T10:20:00.000Z"));
  assert.equal(target.result, "TARGET1");

  const expired = resolveCandidate(candidate, [], Date.parse("2026-07-23T11:01:00.000Z"));
  assert.equal(expired.result, "EXPIRED");
});

test("SHORT candidates reverse stop and target directions", () => {
  const shortCandidate = {
    ...candidate,
    id: "SHORT-1",
    side: "SHORT",
    plan: { side: "SHORT", stop: 105, target1: 95, target2: 90 }
  };
  const target = resolveCandidate(shortCandidate, [{
    time: Date.parse(createdAt) + 15 * 60_000,
    open: 100,
    high: 102,
    low: 94,
    close: 95,
    volume: 1
  }], Date.parse("2026-07-23T10:20:00.000Z"));
  assert.equal(target.result, "TARGET1");

  const stop = resolveCandidate(shortCandidate, [{
    time: Date.parse(createdAt) + 15 * 60_000,
    open: 100,
    high: 106,
    low: 99,
    close: 105,
    volume: 1
  }], Date.parse("2026-07-23T10:20:00.000Z"));
  assert.equal(stop.result, "STOP");
});
