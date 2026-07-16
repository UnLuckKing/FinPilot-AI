import type { AppState } from "./types";

export const demoState: AppState = {
  userName: "Efe Can",
  onboarded: true,
  demo: true,
  profile: {
    income: 50000,
    essentialExpenses: 22000,
    optionalExpenses: 6000,
    cashSavings: 45000,
    creditCardDebt: 8500,
    loanDebt: 0,
    monthlyDebtPayments: 2500,
    emergencyTarget: 66000,
    upcomingExpenses: 5000,
    safetyMargin: 4000,
    experience: "Başlangıç",
    horizon: 5,
    riskTolerance: 3,
    maxLoss: 20,
    goals: ["İşletme sermayesi", "Uzun vadeli birikim"],
    cryptoExposure: true,
    ageRange: "18–24",
  },
  assets: [
    { id: "try", name: "Türk Lirası", symbol: "TRY", category: "Nakit", currency: "TRY", price: 1, change: 0, volatility: 0 },
    { id: "gold", name: "Gram Altın", symbol: "XAUTRY", category: "Altın", currency: "TRY", price: 4820, change: 0.74, volatility: 12 },
    { id: "thyao", name: "Türk Hava Yolları", symbol: "THYAO", category: "BIST", currency: "TRY", price: 338.5, change: -1.12, volatility: 29 },
    { id: "tupras", name: "Tüpraş", symbol: "TUPRS", category: "BIST", currency: "TRY", price: 176.4, change: 0.82, volatility: 24 },
    { id: "voo", name: "Vanguard S&P 500 ETF", symbol: "VOO", category: "ABD Hisse/ETF", currency: "USD", price: 23250, change: 0.34, volatility: 17 },
    { id: "btc", name: "Bitcoin", symbol: "BTC", category: "Kripto", currency: "TRY", price: 2840000, change: -2.18, volatility: 58 },
    { id: "fund", name: "Para Piyasası Fonu", symbol: "PPF", category: "Fon", currency: "TRY", price: 1.426, change: 0.11, volatility: 2 },
    { id: "usd", name: "Amerikan Doları", symbol: "USDTRY", category: "Döviz", currency: "TRY", price: 40.86, change: 0.09, volatility: 9 },
    { id: "eth", name: "Ethereum", symbol: "ETH", category: "Kripto", currency: "TRY", price: 128400, change: -1.44, volatility: 62 },
    { id: "aapl", name: "Apple", symbol: "AAPL", category: "ABD Hisse/ETF", currency: "USD", price: 8920, change: 1.06, volatility: 22 }
  ],
  transactions: [
    { id: "t1", assetId: "try", type: "Alış", quantity: 18000, price: 1, commission: 0, date: "2026-01-10", note: "Nakit yedek" },
    { id: "t2", assetId: "gold", type: "Alış", quantity: 10, price: 3910, commission: 30, date: "2026-02-04" },
    { id: "t3", assetId: "gold", type: "Alış", quantity: 4, price: 4250, commission: 20, date: "2026-04-03" },
    { id: "t4", assetId: "thyao", type: "Alış", quantity: 40, price: 292, commission: 12, date: "2026-03-12" },
    { id: "t5", assetId: "tupras", type: "Alış", quantity: 55, price: 160.2, commission: 10, date: "2026-04-18" },
    { id: "t6", assetId: "voo", type: "Alış", quantity: 0.75, price: 20500, commission: 45, date: "2026-02-22" },
    { id: "t7", assetId: "btc", type: "Alış", quantity: 0.012, price: 2480000, commission: 120, date: "2026-05-08" },
    { id: "t8", assetId: "fund", type: "Alış", quantity: 18000, price: 1.22, commission: 0, date: "2026-01-28" },
    { id: "t9", assetId: "thyao", type: "Satış", quantity: 8, price: 326, commission: 8, date: "2026-06-18" }
  ],
  goals: [
    { id: "g1", name: "Acil durum fonu", target: 66000, current: 45000, targetDate: "2027-01-01", monthlyContribution: 3500, priority: "Yüksek", assumedReturn: 0 },
    { id: "g2", name: "İşletme sermayesi", target: 250000, current: 62000, targetDate: "2028-06-01", monthlyContribution: 6500, priority: "Yüksek", assumedReturn: 12 }
  ],
  alerts: [
    { id: "a1", assetId: "gold", label: "Gram altın hedefi", condition: "Fiyat üstüne çıkarsa", value: 5000, enabled: true },
    { id: "a2", assetId: "btc", label: "BTC düşüş uyarısı", condition: "Günlük düşüş aşarsa", value: 5, enabled: true },
    { id: "a3", label: "Aylık bütçe uyarısı", condition: "Yatırım bütçeyi aşarsa", value: 100, enabled: true }
  ],
  watchlists: [{ id: "w1", name: "Ana Takip", assetIds: ["gold", "thyao", "voo", "btc", "aapl"] }],
  notifications: [
    { id: "n1", title: "Yoğunlaşma uyarısı", body: "Altın ağırlığın hedef aralığının üzerinde.", time: "12 dk", read: false, tone: "warning" },
    { id: "n2", title: "Acil durum fonu", body: "Hedefinin %68'ine ulaştın.", time: "2 sa", read: false, tone: "success" },
    { id: "n3", title: "Demo piyasa verisi", body: "Fiyatlar tanıtım amaçlıdır ve gerçek zamanlı değildir.", time: "Bugün", read: true, tone: "info" }
  ]
};
