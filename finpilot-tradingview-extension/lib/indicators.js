const EPSILON = 1e-9;

export function normalizeBars(rawBars) {
  if (!Array.isArray(rawBars)) return [];
  const byTime = new Map();
  for (const raw of rawBars) {
    const time = finite(raw?.time);
    const open = finite(raw?.open);
    const high = finite(raw?.high);
    const low = finite(raw?.low);
    const close = finite(raw?.close);
    const volume = Math.max(0, finite(raw?.volume));
    if (time <= 0 || open <= 0 || high <= 0 || low <= 0 || close <= 0) continue;
    if (high + EPSILON < Math.max(open, close, low) || low - EPSILON > Math.min(open, close, high)) continue;
    byTime.set(time, { time, open, high, low, close, volume });
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

export function closedBars(rawBars, intervalMs, nowMs = Date.now()) {
  return normalizeBars(rawBars).filter((bar) => bar.time + intervalMs <= nowMs - 2_000);
}

export function emaSeries(values, period) {
  const clean = values.map(finite);
  if (clean.length === 0 || period <= 0) return [];
  const alpha = 2 / (period + 1);
  const result = [clean[0]];
  for (let index = 1; index < clean.length; index += 1) {
    result.push(clean[index] * alpha + result[index - 1] * (1 - alpha));
  }
  return result;
}

export function ema(values, period) {
  return last(emaSeries(values, period)) ?? 0;
}

export function sma(values, period) {
  if (!Array.isArray(values) || period <= 0 || values.length < period) return 0;
  const slice = values.slice(-period);
  return slice.reduce((sum, value) => sum + finite(value), 0) / period;
}

export function standardDeviation(values, period) {
  if (!Array.isArray(values) || period <= 1 || values.length < period) return 0;
  const slice = values.slice(-period).map(finite);
  const average = slice.reduce((sum, value) => sum + value, 0) / period;
  const variance = slice.reduce((sum, value) => sum + ((value - average) ** 2), 0) / period;
  return Math.sqrt(variance);
}

export function rsi(values, period = 14) {
  if (!Array.isArray(values) || values.length <= period) return 50;
  let gains = 0;
  let losses = 0;
  for (let index = 1; index <= period; index += 1) {
    const change = finite(values[index]) - finite(values[index - 1]);
    gains += Math.max(change, 0);
    losses += Math.max(-change, 0);
  }
  let averageGain = gains / period;
  let averageLoss = losses / period;
  for (let index = period + 1; index < values.length; index += 1) {
    const change = finite(values[index]) - finite(values[index - 1]);
    averageGain = ((averageGain * (period - 1)) + Math.max(change, 0)) / period;
    averageLoss = ((averageLoss * (period - 1)) + Math.max(-change, 0)) / period;
  }
  if (averageLoss <= EPSILON) return averageGain <= EPSILON ? 50 : 100;
  const relativeStrength = averageGain / averageLoss;
  return 100 - (100 / (1 + relativeStrength));
}

export function trueRanges(bars) {
  const clean = normalizeBars(bars);
  return clean.map((bar, index) => {
    if (index === 0) return bar.high - bar.low;
    const previousClose = clean[index - 1].close;
    return Math.max(
      bar.high - bar.low,
      Math.abs(bar.high - previousClose),
      Math.abs(bar.low - previousClose)
    );
  });
}

export function atr(bars, period = 14) {
  const ranges = trueRanges(bars);
  if (ranges.length < period) return 0;
  let value = ranges.slice(0, period).reduce((sum, item) => sum + item, 0) / period;
  for (let index = period; index < ranges.length; index += 1) {
    value = ((value * (period - 1)) + ranges[index]) / period;
  }
  return value;
}

export function adx(bars, period = 14) {
  const clean = normalizeBars(bars);
  if (clean.length < period * 2 + 1) return 0;

  const trueRange = [];
  const plusDm = [];
  const minusDm = [];
  for (let index = 1; index < clean.length; index += 1) {
    const current = clean[index];
    const previous = clean[index - 1];
    trueRange.push(Math.max(
      current.high - current.low,
      Math.abs(current.high - previous.close),
      Math.abs(current.low - previous.close)
    ));
    const upMove = current.high - previous.high;
    const downMove = previous.low - current.low;
    plusDm.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDm.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }

  let smoothedTr = sum(trueRange.slice(0, period));
  let smoothedPlus = sum(plusDm.slice(0, period));
  let smoothedMinus = sum(minusDm.slice(0, period));
  const dxValues = [];

  for (let index = period; index < trueRange.length; index += 1) {
    if (index > period) {
      smoothedTr = smoothedTr - (smoothedTr / period) + trueRange[index];
      smoothedPlus = smoothedPlus - (smoothedPlus / period) + plusDm[index];
      smoothedMinus = smoothedMinus - (smoothedMinus / period) + minusDm[index];
    }
    const plusDi = smoothedTr > EPSILON ? (100 * smoothedPlus) / smoothedTr : 0;
    const minusDi = smoothedTr > EPSILON ? (100 * smoothedMinus) / smoothedTr : 0;
    const denominator = plusDi + minusDi;
    dxValues.push(denominator > EPSILON ? (100 * Math.abs(plusDi - minusDi)) / denominator : 0);
  }

  if (dxValues.length < period) return sma(dxValues, dxValues.length);
  let result = sma(dxValues.slice(0, period), period);
  for (let index = period; index < dxValues.length; index += 1) {
    result = ((result * (period - 1)) + dxValues[index]) / period;
  }
  return result;
}

export function macd(values, fast = 12, slow = 26, signal = 9) {
  if (!Array.isArray(values) || values.length < slow + signal) {
    return { line: 0, signal: 0, histogram: 0 };
  }
  const fastSeries = emaSeries(values, fast);
  const slowSeries = emaSeries(values, slow);
  const lineSeries = values.map((_, index) => fastSeries[index] - slowSeries[index]);
  const signalSeries = emaSeries(lineSeries, signal);
  const line = last(lineSeries) ?? 0;
  const signalValue = last(signalSeries) ?? 0;
  return { line, signal: signalValue, histogram: line - signalValue };
}

export function bollinger(values, period = 20, multiplier = 2) {
  const middle = sma(values, period);
  const deviation = standardDeviation(values, period);
  return { middle, upper: middle + deviation * multiplier, lower: middle - deviation * multiplier };
}

export function sessionVwap(bars, maximumBars = 96) {
  const clean = normalizeBars(bars).slice(-maximumBars);
  let weighted = 0;
  let volume = 0;
  for (const bar of clean) {
    if (bar.volume <= 0) continue;
    const typical = (bar.high + bar.low + bar.close) / 3;
    weighted += typical * bar.volume;
    volume += bar.volume;
  }
  return volume > EPSILON ? weighted / volume : 0;
}

export function relativeVolume(bars, period = 20) {
  const clean = normalizeBars(bars);
  if (clean.length < period + 1) return 0;
  const current = clean.at(-1).volume;
  const average = sma(clean.slice(-(period + 1), -1).map((bar) => bar.volume), period);
  return average > EPSILON ? current / average : 0;
}

export function rateOfChange(values, period = 20) {
  if (!Array.isArray(values) || values.length <= period) return 0;
  const current = finite(values.at(-1));
  const previous = finite(values.at(-(period + 1)));
  return previous > EPSILON ? (current / previous) - 1 : 0;
}

export function resampleBars(rawBars, bucketMs) {
  const clean = normalizeBars(rawBars);
  const groups = new Map();
  for (const bar of clean) {
    const bucket = Math.floor(bar.time / bucketMs) * bucketMs;
    const existing = groups.get(bucket);
    if (!existing) {
      groups.set(bucket, { ...bar, time: bucket });
      continue;
    }
    existing.high = Math.max(existing.high, bar.high);
    existing.low = Math.min(existing.low, bar.low);
    existing.close = bar.close;
    existing.volume += bar.volume;
  }
  return [...groups.values()].sort((a, b) => a.time - b.time);
}

export function frameSnapshot(rawBars) {
  const bars = normalizeBars(rawBars);
  if (bars.length < 55) return null;
  const closes = bars.map((bar) => bar.close);
  const current = bars.at(-1);
  const ema9 = ema(closes, 9);
  const ema21 = ema(closes, 21);
  const ema50 = ema(closes, 50);
  const atr14 = atr(bars, 14);
  const rsi14 = rsi(closes, 14);
  const adx14 = adx(bars, 14);
  const macdValue = macd(closes);
  const bands = bollinger(closes);
  const trendScore = scoreTrend({ current, ema9, ema21, ema50, rsi14, adx14, macdValue, bands });
  return {
    price: current.close,
    open: current.open,
    high: current.high,
    low: current.low,
    volume: current.volume,
    time: current.time,
    ema9,
    ema21,
    ema50,
    atr: atr14,
    atrPercent: current.close > EPSILON ? (atr14 / current.close) * 100 : 0,
    rsi: rsi14,
    adx: adx14,
    macdHistogram: macdValue.histogram,
    bollinger: bands,
    roc20: rateOfChange(closes, 20),
    relativeVolume: relativeVolume(bars),
    vwap: sessionVwap(bars) || ema21,
    previousHigh: Math.max(...bars.slice(-21, -1).map((bar) => bar.high)),
    previousLow: Math.min(...bars.slice(-21, -1).map((bar) => bar.low)),
    swingLow: Math.min(...bars.slice(-12).map((bar) => bar.low)),
    swingHigh: Math.max(...bars.slice(-12).map((bar) => bar.high)),
    trendScore,
    bullish: trendScore >= 20,
    bearish: trendScore <= -20,
    enoughHistory: bars.length >= 80
  };
}

function scoreTrend({ current, ema9, ema21, ema50, rsi14, adx14, macdValue, bands }) {
  let score = 0;
  if (current.close > ema9) score += 12;
  else score -= 12;
  if (ema9 > ema21) score += 18;
  else score -= 18;
  if (ema21 > ema50) score += 22;
  else score -= 22;
  if (rsi14 >= 52 && rsi14 <= 72) score += 16;
  else if (rsi14 < 43) score -= 16;
  else if (rsi14 > 78) score -= 8;
  if (macdValue.histogram > 0) score += 14;
  else score -= 14;
  if (adx14 >= 20) score += ema9 > ema21 ? 10 : -10;
  if (bands.middle > 0 && current.close > bands.middle) score += 8;
  else score -= 8;
  return clamp(Math.round(score), -100, 100);
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function last(values) {
  return Array.isArray(values) && values.length > 0 ? values.at(-1) : undefined;
}

function sum(values) {
  return values.reduce((total, value) => total + finite(value), 0);
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}
