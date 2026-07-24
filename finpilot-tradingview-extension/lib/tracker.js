import { normalizeBars } from "./indicators.js";

export function resolveCandidate(candidate, rawBars, nowMs = Date.now()) {
  if (!candidate?.plan || !candidate?.createdAt) return null;
  const started = Date.parse(candidate.createdAt);
  if (!Number.isFinite(started)) return null;
  const bars = normalizeBars(rawBars).filter((bar) => bar.time > started);
  const short = (candidate.side ?? candidate.plan?.side) === "SHORT";
  for (const bar of bars) {
    const stopHit = short
      ? bar.high >= Number(candidate.plan.stop)
      : bar.low <= Number(candidate.plan.stop);
    const target2Hit = short
      ? bar.low <= Number(candidate.plan.target2)
      : bar.high >= Number(candidate.plan.target2);
    const target1Hit = short
      ? bar.low <= Number(candidate.plan.target1)
      : bar.high >= Number(candidate.plan.target1);
    // Aynı mumda sıra bilinemez. Sonuç kullanıcı lehine şişirilmesin diye stop önceliklidir.
    if (stopHit) return closeCandidate(candidate, "STOP", bar.time, bar.close);
    if (target2Hit) return closeCandidate(candidate, "TARGET2", bar.time, bar.close);
    if (target1Hit) return closeCandidate(candidate, "TARGET1", bar.time, bar.close);
  }
  const expiresAt = Date.parse(candidate.expiresAt);
  if (Number.isFinite(expiresAt) && nowMs > expiresAt) {
    const last = bars.at(-1);
    return closeCandidate(candidate, "EXPIRED", nowMs, last?.close ?? null);
  }
  return null;
}

function closeCandidate(candidate, result, time, close) {
  return {
    ...candidate,
    status: "CLOSED",
    result,
    closedAt: new Date(time).toISOString(),
    close
  };
}
