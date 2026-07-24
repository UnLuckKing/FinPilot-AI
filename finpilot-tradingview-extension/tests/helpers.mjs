export const NOW = Date.parse("2026-07-23T12:00:00.000Z");

export function makeBars({
  count = 320,
  intervalMs = 15 * 60_000,
  startPrice = 100,
  drift = 0.00025,
  amplitude = 0.0025,
  bearish = false,
  volume = true,
  shock = 0
} = {}) {
  const bars = [];
  let previous = startPrice;
  const direction = bearish ? -1 : 1;
  for (let index = 0; index < count; index += 1) {
    const cycle = Math.sin(index / 5) * amplitude;
    const slowCycle = Math.sin(index / 19) * amplitude * 0.8;
    const trend = direction * drift * index;
    let close = startPrice * (1 + trend + cycle + slowCycle);
    if (shock && index === count - 1) close *= 1 + shock;
    const open = previous;
    const range = startPrice * (amplitude * 1.5 + 0.0015);
    const high = Math.max(open, close) + range;
    const low = Math.max(0.0001, Math.min(open, close) - range);
    bars.push({
      time: NOW - (count - index + 1) * intervalMs,
      open,
      high,
      low,
      close,
      volume: volume ? 100_000 + (index % 11) * 2_000 + (index === count - 1 ? 40_000 : 0) : 0
    });
    previous = close;
  }
  return bars;
}

export function makeBundle(overrides = {}) {
  const market = overrides.market ?? "STOCK";
  const volume = overrides.volume ?? true;
  const bearish = overrides.bearish ?? false;
  const fifteen = makeBars({ count: 420, intervalMs: 15 * 60_000, drift: 0.00014, amplitude: 0.0028, bearish, volume, shock: overrides.shock ?? 0 });
  const hour = makeBars({ count: 360, intervalMs: 60 * 60_000, drift: 0.00032, amplitude: 0.003, bearish, volume });
  const fourHour = makeBars({ count: 300, intervalMs: 4 * 60 * 60_000, drift: 0.0005, amplitude: 0.004, bearish, volume });
  const day = makeBars({ count: 280, intervalMs: 24 * 60 * 60_000, drift: 0.00075, amplitude: 0.006, bearish, volume });
  if (overrides.stale) {
    for (const frame of [fifteen, hour, fourHour, day]) {
      for (const bar of frame) bar.time -= 10 * 24 * 60 * 60_000;
    }
  }
  return {
    requestedSymbol: overrides.symbol ?? "BIST:TEST",
    provider: overrides.provider ?? "YAHOO",
    providerSymbol: overrides.providerSymbol ?? "TEST.IS",
    market,
    exchange: "BIST",
    ticker: "TEST",
    fetchedAt: NOW,
    intervals: {
      fifteen: 15 * 60_000,
      hour: 60 * 60_000,
      fourHour: 4 * 60 * 60_000,
      day: 24 * 60 * 60_000
    },
    frames: { fifteen, hour, fourHour, day },
    meta: { marketOpen: overrides.marketOpen ?? true, currency: "TRY" }
  };
}
