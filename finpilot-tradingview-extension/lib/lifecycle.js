import { normalizeBars } from "./indicators.js";

export const LIFE_STATES = Object.freeze({
  WATCHING: "İZLENİYOR",
  WAITING_TRIGGER: "TETİK BEKLİYOR",
  WAITING_ENTRY: "GİRİŞ BEKLİYOR",
  IN_TRADE: "İŞLEMDE",
  TARGET1: "KÂR 1 · STOP MALİYETE",
  CLOSED: "KAPANDI"
});

const NON_TRADE_RESULTS = new Set(["NO_ENTRY", "MISSED", "INVALIDATED"]);

export function advanceCandidate(candidate, rawBars, nowMs = Date.now()) {
  if (!candidate?.plan || !candidate?.createdAt) return { candidate: null, outcome: null, events: [] };
  const started = Date.parse(candidate.createdAt);
  if (!Number.isFinite(started)) return { candidate: null, outcome: null, events: [] };

  const next = {
    ...candidate,
    state: candidate.state ?? LIFE_STATES.WAITING_ENTRY,
    plan: { ...candidate.plan },
    events: Array.isArray(candidate.events) ? [...candidate.events] : []
  };
  const events = [];
  const lastProcessed = Number.isFinite(Date.parse(candidate.lastProcessedAt))
    ? Date.parse(candidate.lastProcessedAt)
    : started;
  const bars = normalizeBars(rawBars).filter((bar) => bar.time > lastProcessed);
  const short = (next.side ?? next.plan.side) === "SHORT";

  for (const bar of bars) {
    const waitingAtBarOpen = [LIFE_STATES.WAITING_ENTRY, LIFE_STATES.WAITING_TRIGGER].includes(next.state);
    const tradeAtBarOpen = [LIFE_STATES.IN_TRADE, LIFE_STATES.TARGET1].includes(next.state);
    if (waitingAtBarOpen) next.barsSinceSignal = Number(next.barsSinceSignal ?? 0) + 1;
    if (tradeAtBarOpen) next.holdingBars = Number(next.holdingBars ?? 0) + 1;
    next.lastProcessedAt = new Date(bar.time).toISOString();
    next.lastClose = bar.close;

    if (next.state === LIFE_STATES.WAITING_ENTRY || next.state === LIFE_STATES.WAITING_TRIGGER) {
      if (next.state === LIFE_STATES.WAITING_TRIGGER) {
        const confirmation = Number(next.trigger?.confirmationPrice);
        const triggerTouched = Number.isFinite(confirmation) && (short
          ? bar.low <= confirmation
          : bar.high >= confirmation);
        const invalidated = short
          ? bar.high >= Number(next.plan.stop)
          : bar.low <= Number(next.plan.stop);
        if (invalidated) return closeResult(next, "INVALIDATED", bar.time, bar.close, events, 0);
        if (!triggerTouched) {
          if (entryBarsExpired(next)) return closeResult(next, "NO_ENTRY", bar.time, bar.close, events, 0);
          continue;
        }
        next.state = LIFE_STATES.WAITING_ENTRY;
        pushEvent(next, events, "TRIGGER", bar.time, confirmation, "Tetik seviyesi doğrulandı; giriş bölgesi bekleniyor");
        // Tetik ve giriş aynı mumdaysa sıra bilinemez; ileriye dönük yanlılığı önlemek için sonraki mum beklenir.
        if (entryBarsExpired(next)) return closeResult(next, "NO_ENTRY", bar.time, bar.close, events, 0);
        continue;
      }
      const entryTouched = overlaps(bar.low, bar.high, next.plan.entryLow, next.plan.entryHigh);
      const stopTouched = short
        ? bar.high >= Number(next.plan.stop)
        : bar.low <= Number(next.plan.stop);
      const movedBeyondChase = short
        ? bar.high < Number(next.plan.maximumChase)
        : bar.low > Number(next.plan.maximumChase);

      if (!entryTouched && stopTouched) {
        return closeResult(next, "INVALIDATED", bar.time, bar.close, events, 0);
      }
      if (!entryTouched && movedBeyondChase) {
        return closeResult(next, "MISSED", bar.time, bar.close, events, 0);
      }
      if (!entryTouched) {
        if (entryBarsExpired(next)) return closeResult(next, "NO_ENTRY", bar.time, bar.close, events, 0);
        continue;
      }

      next.state = LIFE_STATES.IN_TRADE;
      next.enteredAt = new Date(bar.time).toISOString();
      next.entryPrice = realisticEntry(next.plan, bar, short);
      next.activeStop = Number(next.plan.stop);
      next.holdingBars = 0;
      next.maxHoldingAt = new Date(bar.time + holdingMs(next)).toISOString();
      pushEvent(next, events, "ENTRY", bar.time, next.entryPrice, "Giriş bölgesi gerçekleşti");

      // Aynı mumdaki sıra bilinemez. Kullanıcı lehine sonuç şişmemesi için stop önce gelir.
      if (stopTouched) {
        return closeResult(next, "STOP", bar.time, next.plan.stop, events, -1);
      }
      const target2Touched = short
        ? bar.low <= Number(next.plan.target2)
        : bar.high >= Number(next.plan.target2);
      if (target2Touched) {
        return closeResult(next, "TARGET2", bar.time, next.plan.target2, events, rewardR(next, next.plan.target2));
      }
      const target1Touched = short
        ? bar.low <= Number(next.plan.target1)
        : bar.high >= Number(next.plan.target1);
      if (target1Touched) markTargetOne(next, bar.time, events);
      continue;
    }

    if (next.state !== LIFE_STATES.IN_TRADE && next.state !== LIFE_STATES.TARGET1) continue;
    const protectedAtEntry = next.state === LIFE_STATES.TARGET1;
    const activeStop = protectedAtEntry ? Number(next.entryPrice) : Number(next.plan.stop);
    const stopTouched = short ? bar.high >= activeStop : bar.low <= activeStop;
    if (stopTouched) {
      const result = protectedAtEntry ? "BREAKEVEN" : "STOP";
      return closeResult(next, result, bar.time, activeStop, events, protectedAtEntry ? 0 : -1);
    }

    const target2Touched = short
      ? bar.low <= Number(next.plan.target2)
      : bar.high >= Number(next.plan.target2);
    if (target2Touched) {
      return closeResult(next, "TARGET2", bar.time, next.plan.target2, events, rewardR(next, next.plan.target2));
    }

    if (!protectedAtEntry) {
      const target1Touched = short
        ? bar.low <= Number(next.plan.target1)
        : bar.high >= Number(next.plan.target1);
      if (target1Touched) markTargetOne(next, bar.time, events);
    }
    if (holdingBarsExpired(next)) {
      return closeResult(next, "TIME_EXIT", bar.time, bar.close, events, rewardR(next, bar.close));
    }
  }

  const entryExpiry = Date.parse(next.entryExpiresAt ?? next.expiresAt);
  if (
    [LIFE_STATES.WAITING_ENTRY, LIFE_STATES.WAITING_TRIGGER].includes(next.state) &&
    Number.isFinite(entryExpiry) &&
    nowMs > entryExpiry
  ) {
    return closeResult(next, "NO_ENTRY", nowMs, next.lastClose ?? null, events, 0);
  }

  const maxHoldingAt = Date.parse(next.maxHoldingAt);
  if (
    [LIFE_STATES.IN_TRADE, LIFE_STATES.TARGET1].includes(next.state) &&
    Number.isFinite(maxHoldingAt) &&
    nowMs > maxHoldingAt
  ) {
    const close = Number.isFinite(Number(next.lastClose)) ? Number(next.lastClose) : Number(next.entryPrice);
    return closeResult(next, "TIME_EXIT", nowMs, close, events, rewardR(next, close));
  }

  return { candidate: next, outcome: null, events };
}

export function resolveCandidate(candidate, rawBars, nowMs = Date.now()) {
  return advanceCandidate(candidate, rawBars, nowMs).outcome;
}

export function isTradeOutcome(item) {
  return Boolean(item?.result) && !NON_TRADE_RESULTS.has(item.result);
}

function markTargetOne(candidate, time, events) {
  candidate.state = LIFE_STATES.TARGET1;
  candidate.target1At = new Date(time).toISOString();
  candidate.activeStop = Number(candidate.entryPrice);
  pushEvent(candidate, events, "TARGET1", time, candidate.plan.target1, "Kâr 1 görüldü; sistem stopu maliyete taşıdı");
}

function closeResult(candidate, result, time, close, events, realizedR) {
  const outcome = {
    ...candidate,
    state: LIFE_STATES.CLOSED,
    status: "CLOSED",
    result,
    realizedR: round(realizedR, 2),
    closedAt: new Date(time).toISOString(),
    close
  };
  pushEvent(outcome, events, result, time, close, resultLabel(result));
  return { candidate: null, outcome, events };
}

function realisticEntry(plan, bar, short) {
  const low = Number(plan.entryLow);
  const high = Number(plan.entryHigh);
  const preferred = Number(plan.entryMid);
  const open = Number(bar.open);
  if (Number.isFinite(open) && open >= low && open <= high) return open;
  if (short && Number.isFinite(open) && open < low) return low;
  if (!short && Number.isFinite(open) && open > high) return high;
  return clamp(preferred, low, high);
}

function rewardR(candidate, exitPrice) {
  const entry = Number(candidate.entryPrice ?? candidate.plan.entryMid);
  const stop = Number(candidate.plan.stop);
  const exit = Number(exitPrice);
  const risk = Math.abs(entry - stop);
  if (![entry, stop, exit, risk].every(Number.isFinite) || risk <= 0) return 0;
  return (candidate.side ?? candidate.plan.side) === "SHORT"
    ? (entry - exit) / risk
    : (exit - entry) / risk;
}

function holdingMs(candidate) {
  const explicit = Number(candidate.maxHoldingMs ?? candidate.plan.maxHoldingMs);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  return candidate.horizon === "SWING" ? 5 * 24 * 60 * 60_000 : 4 * 60 * 60_000;
}

function entryBarsExpired(candidate) {
  const maximum = Number(candidate.entryMaxBars ?? candidate.plan?.entryMaxBars);
  return Number.isFinite(maximum) && maximum > 0 && Number(candidate.barsSinceSignal) >= maximum;
}

function holdingBarsExpired(candidate) {
  const maximum = Number(candidate.maxHoldingBars ?? candidate.plan?.maxHoldingBars);
  return Number.isFinite(maximum) && maximum > 0 && Number(candidate.holdingBars) >= maximum;
}

function pushEvent(candidate, events, type, time, price, message) {
  const event = {
    type,
    at: new Date(time).toISOString(),
    price: Number.isFinite(Number(price)) ? Number(price) : null,
    message
  };
  events.push(event);
  candidate.events = [...(candidate.events ?? []), event].slice(-20);
}

function resultLabel(result) {
  return ({
    STOP: "Stop gerçekleşti",
    TARGET2: "Kâr 2 gerçekleşti",
    BREAKEVEN: "Maliyet korumasıyla kapandı",
    TIME_EXIT: "Azami bekleme süresi doldu",
    NO_ENTRY: "Giriş süresi doldu; işlem oluşmadı",
    MISSED: "Fiyat kovalama sınırını geçti",
    INVALIDATED: "Girişten önce plan bozuldu"
  })[result] ?? result;
}

function overlaps(barLow, barHigh, entryLow, entryHigh) {
  return Number(barHigh) >= Number(entryLow) && Number(barLow) <= Number(entryHigh);
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value, digits = 2) {
  const multiplier = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * multiplier) / multiplier;
}
