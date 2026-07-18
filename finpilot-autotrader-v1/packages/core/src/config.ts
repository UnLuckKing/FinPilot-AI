import { z } from "zod";
import type { StrategyConfig } from "./types.js";

const positiveFraction = z.number().finite().positive().max(1);

export const strategyConfigSchema = z.object({
  version: z.string().min(1),
  timeframeMinutes: z.number().int().positive(),
  riskPerTrade: positiveFraction,
  maximumPositionFraction: positiveFraction,
  maximumDailyLossFraction: positiveFraction,
  maximumCompletedTrades: z.number().int().min(1).max(20),
  signalMaxAgeSeconds: z.number().int().positive(),
  entryExpirySeconds: z.number().int().positive(),
  minimumRewardRiskAfterCosts: z.number().positive(),
  firstTargetR: z.number().positive(),
  secondTargetR: z.number().positive(),
  firstTargetFraction: positiveFraction,
  breakEvenCostBufferBps: z.number().nonnegative(),
  maximumBarsWithoutProgress: z.number().int().positive(),
  minimumRelativeVolume: z.number().positive(),
  minimumAdx: z.number().min(0).max(100),
  minimumRsi: z.number().min(0).max(100),
  maximumRsi: z.number().min(0).max(100),
  maximumVwapDistanceAtr: z.number().positive(),
  minimumAtrPercent: z.number().nonnegative(),
  maximumAtrPercent: z.number().positive(),
  minimumScore: z.number().min(0).max(100),
  highestQualityScore: z.number().min(0).max(100),
  commissionBpsPerSide: z.number().nonnegative(),
  estimatedSlippageBpsPerSide: z.number().nonnegative(),
  stopAtrMultiplier: z.number().positive(),
  limitOffsetBps: z.number().nonnegative(),
  minimumAverageTurnoverTry: z.number().nonnegative(),
  trailingStartR: z.number().positive(),
  trailingAtrMultiplier: z.number().positive()
}).superRefine((value, context) => {
  if (value.maximumRsi <= value.minimumRsi) {
    context.addIssue({ code: "custom", message: "maximumRsi minimumRsi değerinden büyük olmalı" });
  }
  if (value.secondTargetR <= value.firstTargetR) {
    context.addIssue({ code: "custom", message: "İkinci hedef ilk hedeften büyük olmalı" });
  }
  if (value.highestQualityScore < value.minimumScore) {
    context.addIssue({ code: "custom", message: "A kalite eşiği genel eşikten düşük olamaz" });
  }
});

export const defaultStrategyConfig: StrategyConfig = strategyConfigSchema.parse({
  version: "finpilot-intraday-v1.0.0",
  timeframeMinutes: 15,
  riskPerTrade: 0.005,
  maximumPositionFraction: 0.3,
  maximumDailyLossFraction: 0.015,
  maximumCompletedTrades: 3,
  signalMaxAgeSeconds: 180,
  entryExpirySeconds: 180,
  minimumRewardRiskAfterCosts: 1.35,
  firstTargetR: 1,
  secondTargetR: 2,
  firstTargetFraction: 0.5,
  breakEvenCostBufferBps: 12,
  maximumBarsWithoutProgress: 6,
  minimumRelativeVolume: 1.15,
  minimumAdx: 18,
  minimumRsi: 52,
  maximumRsi: 72,
  maximumVwapDistanceAtr: 1.25,
  minimumAtrPercent: 0.35,
  maximumAtrPercent: 4,
  minimumScore: 72,
  highestQualityScore: 86,
  commissionBpsPerSide: 10,
  estimatedSlippageBpsPerSide: 8,
  stopAtrMultiplier: 1.25,
  limitOffsetBps: 4,
  minimumAverageTurnoverTry: 10_000_000,
  trailingStartR: 1.5,
  trailingAtrMultiplier: 1.5
});
