import type { ConditionResult, ScoreResult, SignalMetrics, StrategyConfig } from "./types.js";

const format = (value: number, digits = 2): string => value.toLocaleString("tr-TR", {
  maximumFractionDigits: digits
});

export function evaluateLongSetup(
  price: number,
  metrics: SignalMetrics,
  config: StrategyConfig
): ScoreResult {
  const vwapDistanceAtr = metrics.atr > 0 ? Math.abs(price - metrics.vwap) / metrics.atr : Number.POSITIVE_INFINITY;
  const conditions: ConditionResult[] = [
    result("4h-trend", "Kapanmış 4 saat trendi", metrics.fourHourBullish, 14, metrics.fourHourBullish ? "Yükseliş" : "Yükseliş değil", "Yükseliş"),
    result("1h-trend", "Kapanmış 1 saat trendi", metrics.oneHourBullish, 12, metrics.oneHourBullish ? "Yükseliş" : "Yükseliş değil", "Yükseliş"),
    result("vwap", "15 dk kapanış VWAP üstünde", price > metrics.vwap, 10, `${format(price)} / ${format(metrics.vwap)}`, "Fiyat > VWAP"),
    result("ema", "EMA 9 > EMA 21 > EMA 50", metrics.ema9 > metrics.ema21 && metrics.ema21 > metrics.ema50, 13, `${format(metrics.ema9)} / ${format(metrics.ema21)} / ${format(metrics.ema50)}`, "9 > 21 > 50"),
    result("extended", "VWAP'tan aşırı uzak değil", vwapDistanceAtr <= config.maximumVwapDistanceAtr, 8, `${format(vwapDistanceAtr)} ATR`, `≤ ${format(config.maximumVwapDistanceAtr)} ATR`),
    result("volume", "Göreli hacim", metrics.relativeVolume >= config.minimumRelativeVolume, 11, `${format(metrics.relativeVolume)}x`, `≥ ${format(config.minimumRelativeVolume)}x`),
    result("momentum", "RSI işlem aralığında", metrics.rsi >= config.minimumRsi && metrics.rsi <= config.maximumRsi, 8, format(metrics.rsi, 1), `${config.minimumRsi}–${config.maximumRsi}`),
    result("adx", "Trend gücü", metrics.adx >= config.minimumAdx, 7, format(metrics.adx, 1), `≥ ${config.minimumAdx}`),
    result("atr", "Oynaklık işlem aralığında", metrics.atrPercent >= config.minimumAtrPercent && metrics.atrPercent <= config.maximumAtrPercent, 6, `%${format(metrics.atrPercent)}`, `%${config.minimumAtrPercent}–%${config.maximumAtrPercent}`),
    result("liquidity", "Ortalama işlem hacmi", metrics.averageTurnoverTry >= config.minimumAverageTurnoverTry, 6, `₺${format(metrics.averageTurnoverTry, 0)}`, `≥ ₺${format(config.minimumAverageTurnoverTry, 0)}`),
    result("market", "BIST 100 yönü", metrics.indexBullish !== false, 5, metrics.indexBullish === null ? "Veri yok—nötr" : metrics.indexBullish ? "Yükseliş" : "Düşüş", "Düşüş olmamalı")
  ];
  const totalWeight = conditions.reduce((sum, condition) => sum + condition.weight, 0);
  const passedWeight = conditions.filter((condition) => condition.passed).reduce((sum, condition) => sum + condition.weight, 0);
  const score = Math.round((passedWeight / totalWeight) * 100);
  const hardGatesPass = metrics.fourHourBullish && metrics.oneHourBullish && price > metrics.vwap && metrics.atr > 0;
  const tier = score >= config.highestQualityScore && hardGatesPass ? "A" : score >= config.minimumScore && hardGatesPass ? "B" : "C";

  return {
    score,
    tier,
    eligible: score >= config.minimumScore && hardGatesPass,
    passed: conditions.filter((condition) => condition.passed),
    failed: conditions.filter((condition) => !condition.passed)
  };
}

function result(
  id: string,
  label: string,
  passed: boolean,
  weight: number,
  actual: string,
  required: string
): ConditionResult {
  return { id, label, passed, weight, actual, required };
}
