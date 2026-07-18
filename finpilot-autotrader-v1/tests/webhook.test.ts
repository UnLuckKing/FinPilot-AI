import { describe, expect, it } from "vitest";
import { isStale, tradingViewSignalSchema } from "@finpilot/core";

const valid = {
  version: "1.0",
  strategy: "finpilot-intraday-v1",
  signalId: "ASELS-1721200000-LONG",
  nonce: "ASELS-1721200000-LONG",
  symbol: "ASELS",
  exchange: "BIST",
  timeframe: "15",
  side: "BUY",
  signalPrice: 100,
  barTime: "2026-07-17T10:00:00+03:00",
  sentAt: "2026-07-17T10:00:02+03:00",
  confirmed: true,
  metrics: {
    ema9: 101, ema21: 100, ema50: 99, vwap: 99.5, atr: 2, rsi: 60, adx: 22,
    relativeVolume: 1.5, recentSwingLow: 96, recentSwingHigh: 103, atrPercent: 2,
    averageTurnoverTry: 50_000_000, oneHourBullish: true, fourHourBullish: true,
    indexBullish: true, spreadBps: null
  },
  gatewayToken: "12345678901234567890123456789012"
};

describe("TradingView webhook şeması", () => {
  it("onaylı 15 dakika BIST sinyalini kabul eder", () => {
    expect(tradingViewSignalSchema.safeParse(valid).success).toBe(true);
  });

  it("açık mum, yanlış zaman dilimi, geçersiz sembol ve negatif adedi reddeder", () => {
    expect(tradingViewSignalSchema.safeParse({ ...valid, confirmed: false }).success).toBe(false);
    expect(tradingViewSignalSchema.safeParse({ ...valid, timeframe: "1" }).success).toBe(false);
    expect(tradingViewSignalSchema.safeParse({ ...valid, symbol: "ASELS;DROP" }).success).toBe(false);
    expect(tradingViewSignalSchema.safeParse({ ...valid, signalPrice: -1 }).success).toBe(false);
  });

  it("eski ve gelecek zamanlı alarmı saptar", () => {
    const now = new Date("2026-07-17T07:05:30.000Z");
    expect(isStale("2026-07-17T07:00:00.000Z", now, 180)).toBe(true);
    expect(isStale("2026-07-17T07:05:00.000Z", now, 180)).toBe(false);
    expect(isStale("2026-07-17T07:06:10.000Z", now, 180)).toBe(true);
  });
});
