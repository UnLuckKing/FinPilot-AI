export type AssetCategory = "BIST" | "ABD Hisse/ETF" | "Fon" | "Kripto" | "Altın" | "Döviz" | "Nakit" | "Diğer";
export type RiskProfile = "Çok Temkinli" | "Temkinli" | "Dengeli" | "Agresif" | "Çok Agresif";

export interface Asset {
  id: string;
  name: string;
  symbol: string;
  category: AssetCategory;
  currency: "TRY" | "USD" | "EUR";
  price: number;
  change: number;
  volatility: number;
}

export interface Transaction {
  id: string;
  assetId: string;
  type: "Alış" | "Satış";
  quantity: number;
  price: number;
  commission: number;
  date: string;
  note?: string;
}

export interface FinancialProfile {
  income: number;
  essentialExpenses: number;
  optionalExpenses: number;
  cashSavings: number;
  creditCardDebt: number;
  loanDebt: number;
  monthlyDebtPayments: number;
  emergencyTarget: number;
  upcomingExpenses: number;
  safetyMargin: number;
  experience: string;
  horizon: number;
  riskTolerance: number;
  maxLoss: number;
  goals: string[];
  cryptoExposure: boolean;
  ageRange: string;
}

export interface Goal {
  id: string;
  name: string;
  target: number;
  current: number;
  targetDate: string;
  monthlyContribution: number;
  priority: "Yüksek" | "Orta" | "Düşük";
  assumedReturn: number;
}

export interface Alert {
  id: string;
  assetId?: string;
  label: string;
  condition: string;
  value: number;
  enabled: boolean;
}

export interface Watchlist {
  id: string;
  name: string;
  assetIds: string[];
}

export interface Notification {
  id: string;
  title: string;
  body: string;
  time: string;
  read: boolean;
  tone: "info" | "warning" | "success";
}

export interface AppState {
  profile: FinancialProfile;
  assets: Asset[];
  transactions: Transaction[];
  goals: Goal[];
  alerts: Alert[];
  watchlists: Watchlist[];
  notifications: Notification[];
  userName: string;
  onboarded: boolean;
  demo: boolean;
}

export interface Holding {
  asset: Asset;
  quantity: number;
  averageCost: number;
  invested: number;
  value: number;
  profit: number;
  profitPercent: number;
  realized: number;
}
