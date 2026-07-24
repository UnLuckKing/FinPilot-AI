import { frameSnapshot, rateOfChange, sma } from "./indicators.js";

export function rankDailyFrame(frame) {
  const bars = Array.isArray(frame?.bars) ? frame.bars : [];
  const snapshot = frameSnapshot(bars);
  if (!snapshot || bars.length < 60) return null;
  const closes = bars.map((bar) => bar.close);
  const volumes = bars.slice(-21, -1).map((bar) => Number(bar.volume) || 0);
  const averageVolume = sma(volumes, Math.min(20, volumes.length));
  const averageTurnover = averageVolume * snapshot.price;
  const roc5 = rateOfChange(closes, 5) * 100;
  const roc20 = rateOfChange(closes, 20) * 100;
  const liquidityScore = averageTurnover > 0
    ? clamp((Math.log10(averageTurnover) - 4) * 7, 0, 24)
    : 0;
  const longTrendScore = clamp((snapshot.trendScore + 100) * 0.34, 0, 68);
  const shortTrendScore = clamp((-snapshot.trendScore + 100) * 0.34, 0, 68);
  const longMomentumScore = clamp(roc5 * 0.9, -10, 10) + clamp(roc20 * 0.45, -12, 12);
  const shortMomentumScore = clamp(-roc5 * 0.9, -10, 10) + clamp(-roc20 * 0.45, -12, 12);
  const longStretchPenalty = snapshot.rsi > 78 ? 24 : snapshot.rsi > 73 ? 10 : roc5 < -12 || roc20 < -25 ? 20 : 0;
  const shortStretchPenalty = snapshot.rsi < 22 ? 24 : snapshot.rsi < 27 ? 10 : roc5 > 12 || roc20 > 25 ? 20 : 0;
  const longScore = Math.round(clamp(longTrendScore + liquidityScore + longMomentumScore - longStretchPenalty, 0, 100));
  const shortScore = Math.round(clamp(shortTrendScore + liquidityScore + shortMomentumScore - shortStretchPenalty, 0, 100));
  const bias = shortScore > longScore ? "SHORT" : "LONG";
  return {
    symbol: frame.requestedSymbol,
    score: Math.max(longScore, shortScore),
    longScore,
    shortScore,
    bias,
    trendScore: snapshot.trendScore,
    rsi: snapshot.rsi,
    roc5,
    roc20,
    averageTurnover,
    provider: frame.provider
  };
}

export async function prescreenSymbols(symbols, options = {}) {
  const fetchDaily = options.fetchDaily;
  if (typeof fetchDaily !== "function") throw new Error("Günlük veri işlevi gerekli");
  const concurrency = clamp(Math.trunc(options.concurrency ?? 6), 1, 12);
  const candidates = [];
  let completed = 0;
  let dataFailures = 0;

  for (let index = 0; index < symbols.length; index += concurrency) {
    if (options.cancelled?.()) break;
    const batch = symbols.slice(index, index + concurrency);
    const settled = await Promise.allSettled(batch.map((symbol) => fetchDaily(symbol)));
    for (const item of settled) {
      if (item.status === "fulfilled") {
        const ranked = rankDailyFrame(item.value);
        if (ranked) candidates.push(ranked);
        else dataFailures += 1;
      } else {
        dataFailures += 1;
      }
    }
    completed += batch.length;
    await options.onProgress?.({
      completed,
      total: symbols.length,
      valid: candidates.length,
      dataFailures
    });
  }

  const limit = options.limit ?? 120;
  const sideLimit = Math.ceil(limit / 2);
  const long = [...candidates].sort((left, right) =>
    right.longScore - left.longScore ||
    right.averageTurnover - left.averageTurnover
  ).slice(0, sideLimit);
  const short = [...candidates].sort((left, right) =>
    right.shortScore - left.shortScore ||
    right.averageTurnover - left.averageTurnover
  ).slice(0, sideLimit);
  const selectedSymbols = new Set([...long, ...short].map((item) => item.symbol));
  const selected = candidates
    .filter((item) => selectedSymbols.has(item.symbol))
    .sort((left, right) =>
      right.score - left.score ||
      Number(right.bias === "LONG") - Number(left.bias === "LONG") ||
      right.averageTurnover - left.averageTurnover
    );
  const remaining = candidates
    .filter((item) => !selectedSymbols.has(item.symbol))
    .sort((left, right) => right.score - left.score || right.averageTurnover - left.averageTurnover);
  const sorted = [...selected, ...remaining];
  return {
    candidates: sorted.slice(0, limit),
    total: symbols.length,
    completed,
    valid: candidates.length,
    dataFailures
  };
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, Number(value) || 0));
}
