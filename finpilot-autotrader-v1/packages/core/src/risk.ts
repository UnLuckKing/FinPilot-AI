import type {
  AccountSnapshot,
  DailyRiskSnapshot,
  RiskDecision,
  ScoreResult,
  SignalMetrics,
  StrategyConfig,
  TradePlan
} from "./types.js";

export function deriveRiskDecision(snapshot: DailyRiskSnapshot, config: StrategyConfig): RiskDecision {
  const reasons: string[] = [];
  const maximumDailyLoss = snapshot.openingCapital * config.maximumDailyLossFraction;
  const realisedLoss = Math.max(0, -snapshot.realisedPnl);
  const remainingLossBudgetTry = Math.max(0, maximumDailyLoss - realisedLoss);
  const remainingTrades = Math.max(0, config.maximumCompletedTrades - snapshot.completedTrades);

  if (snapshot.killSwitchActive) reasons.push("Acil durdur etkin");
  if (!snapshot.brokerReliable) reasons.push("Aracı kurum bağlantısı güvenilir değil");
  if (!snapshot.dataFresh) reasons.push("Fiyat verisi eski");
  if (!snapshot.reconciled) reasons.push("Hesap mutabakatı tamamlanmadı");
  if (snapshot.contradictoryState) reasons.push("Emir/pozisyon durumu çelişkili");
  if (realisedLoss >= maximumDailyLoss) reasons.push("Günlük azami kayıp sınırına ulaşıldı");
  if (snapshot.completedTrades >= config.maximumCompletedTrades) reasons.push("Günlük işlem sınırına ulaşıldı");
  if (snapshot.consecutiveLosses >= 3) reasons.push("Arka arkaya üç kayıp");

  const locked = reasons.length > 0;
  if (locked) {
    return {
      state: "GÜN_KİLİTLİ",
      riskMultiplier: 0,
      allowNewOrders: false,
      requireHighestQuality: true,
      reasons,
      remainingLossBudgetTry,
      remainingTrades
    };
  }

  if (snapshot.consecutiveLosses === 2) {
    return {
      state: "YALNIZ_A_KALİTE",
      riskMultiplier: 0.5,
      allowNewOrders: true,
      requireHighestQuality: true,
      reasons: ["İki ardışık kayıp: yalnız A kalite kurulum ve yarım risk"],
      remainingLossBudgetTry,
      remainingTrades
    };
  }
  if (snapshot.consecutiveLosses === 1) {
    return {
      state: "AZALTILMIŞ",
      riskMultiplier: 0.7,
      allowNewOrders: true,
      requireHighestQuality: false,
      reasons: ["İlk kayıp sonrası risk %30 azaltıldı"],
      remainingLossBudgetTry,
      remainingTrades
    };
  }
  return {
    state: "NORMAL",
    riskMultiplier: 1,
    allowNewOrders: true,
    requireHighestQuality: false,
    reasons: [],
    remainingLossBudgetTry,
    remainingTrades
  };
}

export interface TradePlanInput {
  signalId: string;
  symbol: string;
  signalPrice: number;
  metrics: SignalMetrics;
  score: ScoreResult;
  account: AccountSnapshot;
  risk: RiskDecision;
  config: StrategyConfig;
  now: Date;
}

export type TradePlanResult =
  | { ok: true; plan: TradePlan }
  | { ok: false; reason: string };

export function createTradePlan(input: TradePlanInput): TradePlanResult {
  const { account, config, metrics, risk, score } = input;
  if (!risk.allowNewOrders) return { ok: false, reason: risk.reasons.join("; ") || "Risk kilidi" };
  if (!score.eligible) return { ok: false, reason: `Kurulum skoru yetersiz: ${score.score}/100` };
  if (risk.requireHighestQuality && score.tier !== "A") return { ok: false, reason: "Kayıp serisi nedeniyle yalnız A kalite kurulum kabul edilir" };
  if (!Number.isFinite(input.signalPrice) || input.signalPrice <= 0 || metrics.atr <= 0) return { ok: false, reason: "Fiyat veya ATR geçersiz" };

  const limitPrice = roundTick(input.signalPrice * (1 - config.limitOffsetBps / 10_000));
  const atrStop = limitPrice - metrics.atr * config.stopAtrMultiplier;
  const structureStop = metrics.recentSwingLow - metrics.atr * 0.15;
  const stopPrice = roundTick(Math.min(atrStop, structureStop));
  const stopDistance = limitPrice - stopPrice;
  if (stopDistance <= 0) return { ok: false, reason: "Stop mesafesi pozitif değil" };

  const riskBudget = Math.min(
    account.equity * config.riskPerTrade * risk.riskMultiplier,
    risk.remainingLossBudgetTry
  );
  const costRate = (config.commissionBpsPerSide + config.estimatedSlippageBpsPerSide) / 10_000;
  const estimatedRoundTripCostPerShare = limitPrice * costRate * 2;
  const riskPerShare = stopDistance + estimatedRoundTripCostPerShare;
  const byRisk = Math.floor(riskBudget / riskPerShare);
  const byPositionCap = Math.floor((account.equity * config.maximumPositionFraction) / limitPrice);
  const byCash = Math.floor(account.availableCash / (limitPrice * (1 + costRate)));
  const quantity = Math.min(byRisk, byPositionCap, byCash);
  if (quantity < 1) return { ok: false, reason: "Sermaye ve stop mesafesine göre alınabilir adet sıfır" };

  const target1 = roundTick(limitPrice + stopDistance * config.firstTargetR);
  const target2 = roundTick(limitPrice + stopDistance * config.secondTargetR);
  const weightedGrossReward = stopDistance * (
    config.firstTargetR * config.firstTargetFraction +
    config.secondTargetR * (1 - config.firstTargetFraction)
  );
  const expectedRewardRisk = (weightedGrossReward - estimatedRoundTripCostPerShare) / riskPerShare;
  if (expectedRewardRisk < config.minimumRewardRiskAfterCosts) {
    return {
      ok: false,
      reason: `Masraf sonrası ödül/risk ${expectedRewardRisk.toFixed(2)}; gereken ${config.minimumRewardRiskAfterCosts.toFixed(2)}`
    };
  }

  const expiresAt = new Date(input.now.getTime() + config.entryExpirySeconds * 1000).toISOString();
  return {
    ok: true,
    plan: {
      signalId: input.signalId,
      symbol: input.symbol,
      limitPrice,
      quantity,
      estimatedPositionValue: roundMoney(quantity * limitPrice),
      stopPrice,
      riskTry: roundMoney(quantity * riskPerShare),
      target1,
      target2,
      expectedRewardRisk: Number(expectedRewardRisk.toFixed(2)),
      expiresAt,
      score
    }
  };
}

export function breakEvenStop(fillPrice: number, config: StrategyConfig): number {
  return roundTick(fillPrice * (1 + config.breakEvenCostBufferBps / 10_000));
}

export function roundTick(value: number, tick = 0.01): number {
  return Number((Math.round(value / tick) * tick).toFixed(2));
}

function roundMoney(value: number): number {
  return Number(value.toFixed(2));
}
