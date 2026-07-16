const assert = require("node:assert/strict");
const risk = require("./portfolio-risk.js");

const ascending = Array.from({ length: 36 }, (_, index) => index / 100);
const inverse = [...ascending].reverse();
assert.ok(risk.pearson(ascending, ascending) > 0.99);
assert.ok(risk.pearson(ascending, inverse) < -0.99);

const history = { records: [
  { key: "bist:AAA", market: "bist", symbol: "AAA", displaySymbol: "AAA", sector: "Banka", status: "AKTİF", returnSignature: ascending },
  { key: "bist:BBB", market: "bist", symbol: "BBB", displaySymbol: "BBB", sector: "Banka", status: "TAŞINAN STOP", returnSignature: inverse },
] };
const base = (symbol, signature, sector = "Sanayi") => ({ market: "bist", symbol, displaySymbol: symbol, eligible: true, preEligible: true, action: "YATIR", rankScore: 80, returnSignature: signature, fundamental: { sector }, gates: {}, failedGates: [], reasons: [] });
const result = risk.applyPortfolioRisk({ recommendations: [base("CCC", ascending), base("DDD", inverse, "Banka")], snapshot: [], candidateCount: 2 }, history);
assert.equal(result.candidateCount, 0);
assert.equal(result.recommendations[0].gates.portfolio, false);
assert.ok(result.recommendations[0].portfolioRisk.maxCorrelation > 0.99);
assert.ok(result.recommendations[1].portfolioRisk.failures.some((message) => message.includes("Banka yoğunluğu")));

const diversified = risk.applyPortfolioRisk({ recommendations: [base("EEE", inverse, "Teknoloji")], snapshot: [], candidateCount: 1 }, { records: [history.records[0]] });
assert.equal(diversified.candidateCount, 1);
assert.equal(diversified.recommendations[0].gates.portfolio, true);
assert.ok(diversified.recommendations[0].portfolioRisk.suggestedRiskPct <= 0.5);
console.log("FinPilot portfolio risk checks: OK");
