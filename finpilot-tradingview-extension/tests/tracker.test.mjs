import test from "node:test";
import assert from "node:assert/strict";
import { advanceCandidate, LIFE_STATES, resolveCandidate } from "../lib/tracker.js";

const createdAt = "2026-07-23T10:00:00.000Z";
const candidate = {
  id: "TEST-1",
  symbol: "BIST:TEST",
  createdAt,
  entryExpiresAt: "2026-07-23T11:00:00.000Z",
  maxHoldingMs: 60 * 60_000,
  horizon: "INTRADAY",
  side: "LONG",
  state: LIFE_STATES.WAITING_ENTRY,
  plan: {
    side: "LONG",
    entryLow: 99,
    entryHigh: 101,
    entryMid: 100,
    maximumChase: 102,
    stop: 95,
    target1: 105,
    target2: 110
  }
};

test("entry must occur before a target can count", () => {
  const transition = advanceCandidate(candidate, [{
    time: Date.parse(createdAt) + 15 * 60_000,
    open: 106,
    high: 111,
    low: 104,
    close: 109,
    volume: 1
  }], Date.parse("2026-07-23T10:20:00.000Z"));
  assert.equal(transition.outcome.result, "MISSED");
  assert.equal(transition.outcome.enteredAt, undefined);
});

test("same-bar entry, stop and target ambiguity is resolved pessimistically", () => {
  const result = resolveCandidate(candidate, [{
    time: Date.parse(createdAt) + 15 * 60_000,
    open: 100,
    high: 111,
    low: 94,
    close: 106,
    volume: 1
  }], Date.parse("2026-07-23T10:20:00.000Z"));
  assert.equal(result.result, "STOP");
  assert.equal(result.realizedR, -1);
});

test("target one moves the paper stop to entry instead of closing the plan", () => {
  const first = advanceCandidate(candidate, [{
    time: Date.parse(createdAt) + 15 * 60_000,
    open: 100,
    high: 106,
    low: 99,
    close: 105,
    volume: 1
  }], Date.parse("2026-07-23T10:20:00.000Z"));
  assert.equal(first.outcome, null);
  assert.equal(first.candidate.state, LIFE_STATES.TARGET1);
  assert.equal(first.candidate.activeStop, 100);

  const protectedExit = advanceCandidate(first.candidate, [{
    time: Date.parse(createdAt) + 30 * 60_000,
    open: 105,
    high: 106,
    low: 99,
    close: 100,
    volume: 1
  }], Date.parse("2026-07-23T10:35:00.000Z"));
  assert.equal(protectedExit.outcome.result, "BREAKEVEN");
  assert.equal(protectedExit.outcome.realizedR, 0);
});

test("no-entry expiry is excluded from a fabricated trade result", () => {
  const expired = resolveCandidate(candidate, [], Date.parse("2026-07-23T11:01:00.000Z"));
  assert.equal(expired.result, "NO_ENTRY");
  assert.equal(expired.enteredAt, undefined);
});

test("swing entry validity counts closed bars instead of expiring over a weekend", () => {
  const swing = {
    ...candidate,
    id: "SWING-1",
    horizon: "SWING",
    entryExpiresAt: "2026-07-30T10:00:00.000Z",
    entryMaxBars: 2
  };
  const result = resolveCandidate(swing, [1, 2].map((day) => ({
    time: Date.parse(createdAt) + day * 24 * 60 * 60_000,
    open: 97,
    high: 98,
    low: 96,
    close: 97,
    volume: 1
  })), Date.parse("2026-07-25T10:00:00.000Z"));
  assert.equal(result.result, "NO_ENTRY");
});

test("SHORT candidates reverse stop and target directions", () => {
  const shortCandidate = {
    ...candidate,
    id: "SHORT-1",
    side: "SHORT",
    plan: {
      side: "SHORT",
      entryLow: 99,
      entryHigh: 101,
      entryMid: 100,
      maximumChase: 98,
      stop: 105,
      target1: 95,
      target2: 90
    }
  };
  const target = resolveCandidate(shortCandidate, [{
    time: Date.parse(createdAt) + 15 * 60_000,
    open: 100,
    high: 102,
    low: 89,
    close: 91,
    volume: 1
  }], Date.parse("2026-07-23T10:20:00.000Z"));
  assert.equal(target.result, "TARGET2");
  assert.ok(target.realizedR > 0);

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

test("optional setup needs a later trigger bar before entry can activate", () => {
  const armed = {
    ...candidate,
    id: "ARMED-1",
    state: LIFE_STATES.WAITING_TRIGGER,
    trigger: { confirmationPrice: 103 }
  };
  const triggered = advanceCandidate(armed, [{
    time: Date.parse(createdAt) + 15 * 60_000,
    open: 101,
    high: 104,
    low: 99,
    close: 103,
    volume: 1
  }], Date.parse("2026-07-23T10:20:00.000Z"));
  assert.equal(triggered.candidate.state, LIFE_STATES.WAITING_ENTRY);
  assert.equal(triggered.candidate.enteredAt, undefined);
  assert.equal(triggered.events[0].type, "TRIGGER");
});
