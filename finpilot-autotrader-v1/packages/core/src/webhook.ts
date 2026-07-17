import { z } from "zod";

const finitePositive = z.coerce.number().finite().positive();
const finiteNonNegative = z.coerce.number().finite().nonnegative();

export const tradingViewSignalSchema = z.object({
  version: z.literal("1.0"),
  strategy: z.literal("finpilot-intraday-v1"),
  signalId: z.string().min(8).max(160).regex(/^[A-Za-z0-9_.:-]+$/),
  nonce: z.string().min(8).max(160).regex(/^[A-Za-z0-9_.:-]+$/),
  symbol: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,20}$/),
  exchange: z.literal("BIST"),
  timeframe: z.literal("15"),
  side: z.enum(["BUY", "SELL"]),
  signalPrice: finitePositive,
  barTime: z.iso.datetime({ offset: true }),
  sentAt: z.iso.datetime({ offset: true }),
  confirmed: z.literal(true),
  metrics: z.object({
    ema9: finitePositive,
    ema21: finitePositive,
    ema50: finitePositive,
    vwap: finitePositive,
    atr: finitePositive,
    rsi: finiteNonNegative.max(100),
    adx: finiteNonNegative.max(100),
    relativeVolume: finiteNonNegative,
    recentSwingLow: finitePositive,
    recentSwingHigh: finitePositive,
    atrPercent: finiteNonNegative,
    averageTurnoverTry: finiteNonNegative,
    oneHourBullish: z.boolean(),
    fourHourBullish: z.boolean(),
    indexBullish: z.boolean().nullable(),
    spreadBps: finiteNonNegative.nullable()
  }),
  gatewayToken: z.string().min(32).max(256).optional()
}).strict();

export type ParsedTradingViewSignal = z.infer<typeof tradingViewSignalSchema>;

export function isStale(isoTime: string, now: Date, maximumAgeSeconds: number): boolean {
  const sent = new Date(isoTime).getTime();
  if (!Number.isFinite(sent)) return true;
  const difference = now.getTime() - sent;
  return difference < -30_000 || difference > maximumAgeSeconds * 1000;
}
