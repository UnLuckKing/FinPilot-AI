import type { AppState, FinancialProfile, Holding, RiskProfile, Transaction } from "./types";

export const formatTRY = (value: number, compact = false) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: compact ? 0 : 2, notation: compact ? "compact" : "standard" }).format(value || 0);

export const formatPct = (value: number) => `${value >= 0 ? "+" : ""}${value.toLocaleString("tr-TR", { maximumFractionDigits: 2 })}%`;

export function calculateRiskProfile(profile: FinancialProfile): RiskProfile {
  let score = profile.riskTolerance;
  if (profile.horizon >= 7) score += 0.6;
  if (profile.maxLoss >= 30) score += 0.5;
  if (profile.creditCardDebt > profile.income * 0.5) score -= 0.8;
  if (profile.cashSavings < profile.essentialExpenses * 2) score -= 0.7;
  if (score < 1.8) return "Çok Temkinli";
  if (score < 2.7) return "Temkinli";
  if (score < 3.6) return "Dengeli";
  if (score < 4.5) return "Agresif";
  return "Çok Agresif";
}

export function calculateBudget(profile: FinancialProfile) {
  const freeCashFlow = Math.max(0, profile.income - profile.essentialExpenses - profile.optionalExpenses - profile.monthlyDebtPayments);
  const emergencyGap = Math.max(0, profile.emergencyTarget - profile.cashSavings);
  const emergencyContribution = Math.min(emergencyGap, Math.max(0, freeCashFlow * 0.35));
  const debtExtra = profile.creditCardDebt > 0 ? Math.min(profile.creditCardDebt, freeCashFlow * 0.25) : 0;
  const investable = Math.max(0, freeCashFlow - emergencyContribution - debtExtra - profile.upcomingExpenses - profile.safetyMargin);
  return {
    freeCashFlow,
    emergencyGap,
    emergencyContribution,
    debtExtra,
    safe: Math.round(investable * 0.6),
    balanced: Math.round(investable * 0.8),
    upper: Math.round(investable),
    debtToIncome: profile.income ? ((profile.monthlyDebtPayments + Math.min(profile.creditCardDebt, profile.income)) / profile.income) * 100 : 0,
    emergencyPercent: profile.emergencyTarget ? Math.min(100, (profile.cashSavings / profile.emergencyTarget) * 100) : 100,
  };
}

export function calculateHoldings(state: Pick<AppState, "assets" | "transactions">): Holding[] {
  return state.assets.map((asset) => {
    const txs = state.transactions.filter((t) => t.assetId === asset.id).sort((a, b) => a.date.localeCompare(b.date));
    let quantity = 0;
    let costBasis = 0;
    let realized = 0;
    txs.forEach((tx) => {
      if (tx.type === "Alış") {
        quantity += tx.quantity;
        costBasis += tx.quantity * tx.price + tx.commission;
      } else if (quantity > 0) {
        const sold = Math.min(tx.quantity, quantity);
        const average = costBasis / quantity;
        realized += sold * tx.price - tx.commission - sold * average;
        quantity -= sold;
        costBasis -= sold * average;
      }
    });
    const value = quantity * asset.price;
    const profit = value - costBasis;
    return { asset, quantity, averageCost: quantity ? costBasis / quantity : 0, invested: costBasis, value, profit, profitPercent: costBasis ? (profit / costBasis) * 100 : 0, realized };
  }).filter((h) => h.quantity > 0.000001);
}

export function portfolioSummary(state: AppState) {
  const holdings = calculateHoldings(state);
  const value = holdings.reduce((sum, h) => sum + h.value, 0);
  const invested = holdings.reduce((sum, h) => sum + h.invested, 0);
  const profit = value - invested;
  const daily = holdings.reduce((sum, h) => sum + h.value * (h.asset.change / 100), 0);
  const allocations = holdings.reduce<Record<string, number>>((acc, h) => {
    acc[h.asset.category] = (acc[h.asset.category] || 0) + h.value;
    return acc;
  }, {});
  const riskScore = value ? Math.min(100, holdings.reduce((sum, h) => sum + h.asset.volatility * h.value, 0) / value * 1.45) : 0;
  const maxWeight = value ? Math.max(...Object.values(allocations).map((x) => x / value), 0) : 0;
  const diversification = Math.max(0, Math.min(100, 100 - maxWeight * 65 + Math.min(holdings.length, 8) * 4));
  return { holdings, value, invested, profit, profitPercent: invested ? profit / invested * 100 : 0, daily, allocations, riskScore, diversification };
}

export function recommendedAllocation(profile: FinancialProfile): Record<string, number> {
  const risk = calculateRiskProfile(profile);
  const base: Record<RiskProfile, number[]> = {
    "Çok Temkinli": [45, 25, 15, 5, 5, 5, 0, 0],
    "Temkinli": [35, 22, 17, 8, 8, 8, 2, 0],
    "Dengeli": [22, 18, 18, 14, 14, 10, 4, 0],
    "Agresif": [12, 14, 15, 20, 22, 9, 7, 1],
    "Çok Agresif": [8, 10, 12, 22, 28, 8, 10, 2]
  };
  const labels = ["Nakit & Para Piyasası", "Altın", "Türk Fonları", "BIST", "Uluslararası", "Borçlanma Araçları", "Kripto", "Alternatif"];
  const values = [...base[risk]];
  if (!profile.cryptoExposure) { values[0] += values[6]; values[6] = 0; }
  if (profile.cashSavings < profile.emergencyTarget) { const shift = Math.min(8, values[4]); values[0] += shift; values[4] -= shift; }
  if (profile.creditCardDebt > 0) { const shift = Math.min(5, values[3]); values[0] += shift; values[3] -= shift; }
  return Object.fromEntries(labels.map((label, i) => [label, values[i]]));
}

export function generateAiInsights(state: AppState): string[] {
  const summary = portfolioSummary(state);
  const budget = calculateBudget(state.profile);
  const total = summary.value || 1;
  const sorted = Object.entries(summary.allocations).sort((a, b) => b[1] - a[1]);
  const top = sorted[0];
  const crypto = (summary.allocations.Kripto || 0) / total * 100;
  const insights: string[] = [];
  if (top) insights.push(`${top[0]} portföyün %${(top[1] / total * 100).toFixed(0)}'ini oluşturuyor. %35 üzerindeki tek kategori yoğunlaşması dalgalanmayı artırabilir.`);
  insights.push(`Hesaplanan dengeli aylık yatırım bütçen ${formatTRY(budget.balanced, true)}. Bu tutar gelir, gider, borç, acil fon açığı ve güvenlik payından sonra kalan nakit üzerinden hesaplandı.`);
  if (budget.emergencyPercent < 100) insights.push(`Acil durum fonun hedefinin %${budget.emergencyPercent.toFixed(0)}'inde. Hedefe ulaşana kadar aylık ${formatTRY(budget.emergencyContribution, true)} ayırmak riski azaltır.`);
  if (crypto > 8 && calculateRiskProfile(state.profile).includes("Temkinli")) insights.push(`Kripto ağırlığın %${crypto.toFixed(1)}; ${calculateRiskProfile(state.profile)} profil için bu oran yüksek olabilir.`);
  insights.push(`Portföy risk puanın 100 üzerinden ${summary.riskScore.toFixed(0)}, çeşitlendirme puanın ${summary.diversification.toFixed(0)}. Bu değerler mevcut ağırlıklar ve demo volatilite göstergelerinden türetilmiştir.`);
  return insights;
}

export function parseCsvTransactions(csv: string): Omit<Transaction, "id">[] {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((x) => x.trim().toLowerCase());
  const required = ["assetid", "type", "quantity", "price", "commission", "date"];
  if (!required.every((x) => headers.includes(x))) throw new Error("CSV sütunları eksik.");
  return lines.slice(1).map<Omit<Transaction, "id">>((line) => {
    const cells = line.split(",").map((x) => x.trim().replace(/^\"|\"$/g, ""));
    const row = Object.fromEntries(headers.map((h, i) => [h, cells[i] || ""]));
    return {
      assetId: row.assetid.replace(/[^a-zA-Z0-9_-]/g, ""),
      type: (row.type === "Satış" ? "Satış" : "Alış") as Transaction["type"],
      quantity: Math.max(0, Number(row.quantity)),
      price: Math.max(0, Number(row.price)),
      commission: Math.max(0, Number(row.commission)),
      date: /^\d{4}-\d{2}-\d{2}$/.test(row.date) ? row.date : new Date().toISOString().slice(0, 10),
      note: row.note?.slice(0, 120),
    };
  }).filter((t) => t.quantity > 0 && t.price >= 0);
}
