import { describe, expect, it } from "vitest";
import {
  createTradePlan,
  defaultStrategyConfig,
  deriveRiskDecision,
  evaluateLongSetup,
  type AccountSnapshot,
  type DailyRiskSnapshot,
  type SignalMetrics
} from "@finpilot/core";

const metrics: SignalMetrics = {
  ema9: 101,
  ema21: 100,
  ema50: 98,
  vwap: 99.5,
  atr: 2,
  rsi: 60,
  adx: 25,
  relativeVolume: 1.8,
  recentSwingLow: 96,
  recentSwingHigh: 104,
  atrPercent: 2,
  averageTurnoverTry: 50_000_000,
  oneHourBullish: true,
  fourHourBullish: true,
  indexBullish: true,
  spreadBps: 5
};

const account: AccountSnapshot = {
  currency: "TRY",
  cash: 100_000,
  availableCash: 100_000,
  equity: 100_000,
  updatedAt: "2026-07-17T10:00:00.000Z"
};

function daily(overrides: Partial<DailyRiskSnapshot> = {}): DailyRiskSnapshot {
  return {
    date: "2026-07-17",
    openingCapital: 100_000,
    realisedPnl: 0,
    unrealisedPnl: 0,
    consecutiveLosses: 0,
    completedTrades: 0,
    killSwitchActive: false,
    brokerReliable: true,
    dataFresh: true,
    reconciled: true,
    contradictoryState: false,
    ...overrides
  };
}

describe("günlük kayıp durum makinesi", () => {
  it("ilk kayıptan sonra riski yüzde 30 azaltır", () => {
    const result = deriveRiskDecision(daily({ consecutiveLosses: 1 }), defaultStrategyConfig);
    expect(result.state).toBe("AZALTILMIŞ");
    expect(result.riskMultiplier).toBe(0.7);
  });

  it("ikinci kayıpta yalnız A kalite ve yarım risk uygular", () => {
    const result = deriveRiskDecision(daily({ consecutiveLosses: 2 }), defaultStrategyConfig);
    expect(result.state).toBe("YALNIZ_A_KALİTE");
    expect(result.riskMultiplier).toBe(0.5);
    expect(result.requireHighestQuality).toBe(true);
  });

  it("üçüncü kayıpta yeni emri kapatır", () => {
    const result = deriveRiskDecision(daily({ consecutiveLosses: 3 }), defaultStrategyConfig);
    expect(result.allowNewOrders).toBe(false);
    expect(result.reasons).toContain("Arka arkaya üç kayıp");
  });

  it("günlük kayıp ve işlem sınırlarını ayrı ayrı kilitler", () => {
    expect(deriveRiskDecision(daily({ realisedPnl: -1_500 }), defaultStrategyConfig).allowNewOrders).toBe(false);
    expect(deriveRiskDecision(daily({ completedTrades: 3 }), defaultStrategyConfig).allowNewOrders).toBe(false);
  });

  it("mutabakat, veri veya kill switch sorununda güvenli biçimde kapanır", () => {
    for (const overrides of [{ reconciled: false }, { dataFresh: false }, { killSwitchActive: true }, { contradictoryState: true }]) {
      expect(deriveRiskDecision(daily(overrides), defaultStrategyConfig).allowNewOrders).toBe(false);
    }
  });
});

describe("puan ve pozisyon boyutu", () => {
  it("koşulları açıklanabilir şekilde puanlar", () => {
    const score = evaluateLongSetup(102, metrics, defaultStrategyConfig);
    expect(score.eligible).toBe(true);
    expect(score.tier).toBe("A");
    expect(score.failed).toHaveLength(0);
  });

  it("stop mesafesinden adet, iki hedef ve TL risk üretir", () => {
    const score = evaluateLongSetup(102, metrics, defaultStrategyConfig);
    const risk = deriveRiskDecision(daily(), defaultStrategyConfig);
    const result = createTradePlan({ signalId: "ASELS-1-LONG", symbol: "ASELS", signalPrice: 102, metrics, score, account, risk, config: defaultStrategyConfig, now: new Date("2026-07-17T09:00:00Z") });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.quantity).toBeGreaterThan(0);
    expect(result.plan.estimatedPositionValue).toBeLessThanOrEqual(30_000);
    expect(result.plan.stopPrice).toBeLessThan(result.plan.limitPrice);
    expect(result.plan.target2).toBeGreaterThan(result.plan.target1);
    expect(result.plan.riskTry).toBeLessThanOrEqual(500.5);
  });

  it("sermaye yetersizse sıfır adetle işlem açmaz", () => {
    const score = evaluateLongSetup(102, metrics, defaultStrategyConfig);
    const risk = deriveRiskDecision(daily(), defaultStrategyConfig);
    const tiny = { ...account, cash: 5, availableCash: 5, equity: 5 };
    const result = createTradePlan({ signalId: "ASELS-2-LONG", symbol: "ASELS", signalPrice: 102, metrics, score, account: tiny, risk, config: defaultStrategyConfig, now: new Date() });
    expect(result).toEqual({ ok: false, reason: "Sermaye ve stop mesafesine göre alınabilir adet sıfır" });
  });

  it("ikinci kayıpta B kalite kurulumu reddeder", () => {
    const bMetrics = { ...metrics, indexBullish: false, adx: 15, relativeVolume: 1 };
    const score = evaluateLongSetup(102, bMetrics, defaultStrategyConfig);
    expect(score.tier).toBe("B");
    const risk = deriveRiskDecision(daily({ consecutiveLosses: 2 }), defaultStrategyConfig);
    const result = createTradePlan({ signalId: "ASELS-3-LONG", symbol: "ASELS", signalPrice: 102, metrics: bMetrics, score, account, risk, config: defaultStrategyConfig, now: new Date() });
    expect(result.ok).toBe(false);
  });
});
