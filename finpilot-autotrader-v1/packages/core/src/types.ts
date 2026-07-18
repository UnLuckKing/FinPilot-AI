export type TradingMode = "PAPER" | "LIVE";
export type Side = "BUY" | "SELL";
export type OrderType = "MARKET" | "LIMIT" | "STOP" | "STOP_LIMIT";
export type TimeInForce = "DAY" | "IOC";
export type OrderStatus =
  | "PENDING"
  | "ACCEPTED"
  | "PARTIALLY_FILLED"
  | "FILLED"
  | "CANCELLED"
  | "REJECTED"
  | "EXPIRED";

export type SignalViewState =
  | "ÖN AL"
  | "BEKLE"
  | "ONAYLI AL"
  | "POZİSYONDA"
  | "ÖN SAT"
  | "ONAYLI SAT"
  | "İŞLEM YASAK"
  | "GÜN KAPATILDI";

export type RiskStateName = "NORMAL" | "AZALTILMIŞ" | "YALNIZ_A_KALİTE" | "GÜN_KİLİTLİ";

export interface StrategyConfig {
  version: string;
  timeframeMinutes: number;
  riskPerTrade: number;
  maximumPositionFraction: number;
  maximumDailyLossFraction: number;
  maximumCompletedTrades: number;
  signalMaxAgeSeconds: number;
  entryExpirySeconds: number;
  minimumRewardRiskAfterCosts: number;
  firstTargetR: number;
  secondTargetR: number;
  firstTargetFraction: number;
  breakEvenCostBufferBps: number;
  maximumBarsWithoutProgress: number;
  minimumRelativeVolume: number;
  minimumAdx: number;
  minimumRsi: number;
  maximumRsi: number;
  maximumVwapDistanceAtr: number;
  minimumAtrPercent: number;
  maximumAtrPercent: number;
  minimumScore: number;
  highestQualityScore: number;
  commissionBpsPerSide: number;
  estimatedSlippageBpsPerSide: number;
  stopAtrMultiplier: number;
  limitOffsetBps: number;
  minimumAverageTurnoverTry: number;
  trailingStartR: number;
  trailingAtrMultiplier: number;
}

export interface SignalMetrics {
  ema9: number;
  ema21: number;
  ema50: number;
  vwap: number;
  atr: number;
  rsi: number;
  adx: number;
  relativeVolume: number;
  recentSwingLow: number;
  recentSwingHigh: number;
  atrPercent: number;
  averageTurnoverTry: number;
  oneHourBullish: boolean;
  fourHourBullish: boolean;
  indexBullish: boolean | null;
  spreadBps: number | null;
}

export interface TradingViewSignal {
  version: "1.0";
  strategy: "finpilot-intraday-v1";
  signalId: string;
  nonce: string;
  symbol: string;
  exchange: "BIST";
  timeframe: "15";
  side: Side;
  signalPrice: number;
  barTime: string;
  sentAt: string;
  confirmed: boolean;
  metrics: SignalMetrics;
  gatewayToken?: string;
}

export interface ConditionResult {
  id: string;
  label: string;
  passed: boolean;
  weight: number;
  actual: string;
  required: string;
}

export interface ScoreResult {
  score: number;
  tier: "A" | "B" | "C";
  eligible: boolean;
  passed: ConditionResult[];
  failed: ConditionResult[];
}

export interface DailyRiskSnapshot {
  date: string;
  openingCapital: number;
  realisedPnl: number;
  unrealisedPnl: number;
  consecutiveLosses: number;
  completedTrades: number;
  killSwitchActive: boolean;
  brokerReliable: boolean;
  dataFresh: boolean;
  reconciled: boolean;
  contradictoryState: boolean;
}

export interface RiskDecision {
  state: RiskStateName;
  riskMultiplier: number;
  allowNewOrders: boolean;
  requireHighestQuality: boolean;
  reasons: string[];
  remainingLossBudgetTry: number;
  remainingTrades: number;
}

export interface TradePlan {
  signalId: string;
  symbol: string;
  limitPrice: number;
  quantity: number;
  estimatedPositionValue: number;
  stopPrice: number;
  riskTry: number;
  target1: number;
  target2: number;
  expectedRewardRisk: number;
  expiresAt: string;
  score: ScoreResult;
}

export interface AccountSnapshot {
  currency: "TRY";
  cash: number;
  availableCash: number;
  equity: number;
  updatedAt: string;
}

export interface Position {
  symbol: string;
  quantity: number;
  averagePrice: number;
  lastPrice: number;
  unrealisedPnl: number;
  openedAt: string;
  stopPrice: number | null;
  target1: number | null;
  target2: number | null;
  target1Completed: boolean;
}

export interface OrderRequest {
  clientOrderId: string;
  signalId: string;
  symbol: string;
  side: Side;
  type: OrderType;
  quantity: number;
  limitPrice?: number;
  stopPrice?: number;
  timeInForce: TimeInForce;
  expiresAt?: string;
  reduceOnly?: boolean;
  metadata?: Record<string, string | number | boolean>;
}

export interface OrderResponse extends OrderRequest {
  brokerOrderId: string;
  status: OrderStatus;
  filledQuantity: number;
  averageFillPrice: number | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Execution {
  executionId: string;
  brokerOrderId: string;
  symbol: string;
  side: Side;
  quantity: number;
  price: number;
  commission: number;
  executedAt: string;
}

export type ExecutionHandler = (execution: Execution) => void | Promise<void>;
export type Unsubscribe = () => void;

export interface ConnectionStatus {
  connected: boolean;
  adapter: string;
  reconciliation: "FULL" | "LIMITED" | "NONE";
  message: string;
  checkedAt: string;
}

export interface ReconciliationResult {
  safe: boolean;
  account: AccountSnapshot;
  positions: Position[];
  orders: OrderResponse[];
  conflicts: string[];
  checkedAt: string;
}

export interface OrderChanges {
  quantity?: number;
  limitPrice?: number;
  stopPrice?: number;
  expiresAt?: string;
}

export interface MarketCandle {
  symbol: string;
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface DashboardSnapshot {
  mode: TradingMode;
  broker: ConnectionStatus;
  capital: number;
  availableCash: number;
  realisedPnl: number;
  unrealisedPnl: number;
  risk: RiskDecision;
  dataFresh: boolean;
  lastWebhookAt: string | null;
  killSwitchActive: boolean;
  openPositions: Position[];
  pendingOrders: OrderResponse[];
  recentSignals: Array<{
    id: string;
    symbol: string;
    state: string;
    score: number;
    createdAt: string;
    reason: string;
  }>;
  health: Array<{ name: string; state: "OK" | "WARN" | "BLOCKED"; detail: string }>;
}
