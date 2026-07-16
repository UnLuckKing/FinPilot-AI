const assert = require("node:assert/strict");
const intelligence = require("./decision-intelligence.js");

function signature(value, count = 84) {
  return Array.from({ length: count }, () => value);
}

const snapshots = [
  { market: "bist", symbol: "AAA", returnSignature: signature(0.0020) },
  { market: "bist", symbol: "BBB", returnSignature: signature(0.0015) },
  { market: "bist", symbol: "CCC", returnSignature: signature(0.0010) },
  { market: "bist", symbol: "DDD", returnSignature: signature(0.0005) },
  { market: "bist", symbol: "EEE", returnSignature: signature(0.0000) },
  { market: "bist", symbol: "FFF", returnSignature: signature(-0.0005) },
];

const strong = {
  market: "bist",
  symbol: "AAA",
  displaySymbol: "AAA",
  action: "YATIR",
  eligible: true,
  rankScore: 84,
  returnSignature: snapshots[0].returnSignature,
  gates: { setup: true },
  failedGates: [],
  orderPlan: { limitBuy: 100, stopTrigger: 95, target1: 107.5, target2: 111, valid: true },
  portfolioRisk: { suggestedRiskPct: 0.5 },
  validation: { evidenceGrade: "B", selectedEvidenceGrade: "B", overallEvidenceGrade: "B", oos: { trades: 12 }, requiredOosTrades: 12 },
  strategy: { id: "trend" },
};

const result = {
  recommendations: [strong],
  snapshot: snapshots,
  markets: { bist: { recommendations: [strong], snapshot: snapshots }, crypto: { recommendations: [], snapshot: [] } },
  research: {},
};

const relative = intelligence.relativeStrengthFor(strong, snapshots);
assert.equal(relative.available, true);
assert.equal(relative.passed, true);
assert.ok(relative.percentile20 >= 90);

const relativeResult = intelligence.applyRelativeStrength(result);
assert.equal(relativeResult.recommendations[0].gates.relativeStrength, true);
assert.equal(relativeResult.candidateCount, 1);

const sizing = intelligence.positionSizing(strong, 100000);
assert.equal(sizing.valid, true);
assert.ok(sizing.positionValue <= 20000);
assert.ok(sizing.maxLoss <= 500.01);

const stressed = intelligence.applyPositionSizingAndStress(relativeResult, null, { paperCapital: 100000 });
assert.equal(stressed.recommendations[0].gates.portfolioStress, true);
assert.equal(stressed.recommendations[0].positionSizing.valid, true);
assert.ok(stressed.portfolioStress.totalRiskPct <= 2);

const overloadedHistory = { records: [{
  market: "bist", status: "AKTİF", entry: 100, currentStop: 95, quantity: 300,
  positionSizing: { quantity: 300, positionValue: 30000, maxLoss: 1600 },
}] };
const blockedByStress = intelligence.applyPositionSizingAndStress(relativeResult, overloadedHistory, { paperCapital: 100000 });
assert.equal(blockedByStress.recommendations[0].eligible, false);
assert.equal(blockedByStress.recommendations[0].gates.portfolioStress, false);
assert.match(blockedByStress.recommendations[0].gateDiagnostics.portfolioStress.message, /Toplam stop riski/);

const waiting = {
  ...strong,
  eligible: false,
  action: "YATIRMA",
  failedGates: [{ key: "validation", label: "Dönem dışı test", message: "Örnek az" }],
  validation: { evidenceGrade: "C", selectedEvidenceGrade: "B", overallEvidenceGrade: "C", oos: { trades: 9 }, requiredOosTrades: 12 },
};
assert.match(intelligence.nextCondition(waiting).primary, /3 dönem dışı işlem daha gerekiyor \(9\/12\)/);

const journal = intelligence.updateDecisionJournal({ recommendations: [waiting] }, { ...stressed, recommendations: [strong] }, null, new Date("2026-07-16T12:00:00Z"));
assert.equal(journal.journal.latestChanges.length, 1);
assert.match(journal.result.recommendations[0].decisionChange.summary, /karar YATIRMA → YATIR/);

const records = Array.from({ length: 12 }, (_, index) => ({
  market: "bist",
  strategyId: "trend",
  status: "STOP",
  resultR: index < 3 ? 1 : -1,
  predictedProbabilityUp: 70,
  closedAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
}));
const health = intelligence.modelHealth({ records });
assert.equal(health.summaries["bist:trend"].status, "KİLİTLİ");
assert.equal(health.summaries["bist:trend"].passed, false);
const healthApplied = intelligence.applyModelHealth(result, { records });
assert.equal(healthApplied.recommendations[0].eligible, false);
assert.equal(healthApplied.recommendations[0].gates.modelHealth, false);
assert.match(healthApplied.recommendations[0].reasons.at(-1), /otomatik kilitlendi/);

console.log("FinPilot decision intelligence checks: OK");
