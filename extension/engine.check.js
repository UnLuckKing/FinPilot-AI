const assert = require("node:assert/strict");
const engine = require("./engine.js");

function sampleRows(count = 520) {
  const rows = [];
  let close = 100;
  for (let i = 0; i < count; i += 1) {
    const drift = 0.13 + Math.sin(i / 11) * 0.32 + Math.cos(i / 29) * 0.18;
    const open = close;
    close = Math.max(1, close + drift);
    rows.push({ time: String(i), open, high: Math.max(open, close) + 0.65, low: Math.min(open, close) - 0.55, close, volume: 1000 + (i % 17) * 45 });
  }
  return rows;
}

const rows = sampleRows();
const analysis = engine.analyze(rows, { threshold: 56, minimumTrades: 5, rewardRisk: 1.5 });
assert.ok(analysis.latest.scoreLong >= 0);
assert.ok(analysis.estimatedProbability >= 5 && analysis.estimatedProbability <= 95);
assert.ok(analysis.model.available);
assert.equal(analysis.agents.length, 8);
assert.equal(analysis.strategy.mode, "trend");
assert.ok(analysis.agents.some((agent) => agent.name === "Strateji Seçici"));
assert.deepEqual(analysis.forecasts.map((forecast) => forecast.horizon), [1, 5, 20]);
assert.ok(analysis.forecasts.every((forecast) => forecast.available));
for (const forecast of analysis.forecasts) {
  assert.ok(Math.abs(forecast.probabilityUp + forecast.probabilityDown + forecast.probabilityFlat - 100) < 0.0001);
  assert.ok(forecast.expectedLowPct <= forecast.expectedMedianPct);
  assert.ok(forecast.expectedMedianPct <= forecast.expectedHighPct);
}
assert.ok(analysis.backtest.stress.available);
assert.ok(analysis.backtest.stress.profitablePct >= 0 && analysis.backtest.stress.profitablePct <= 100);

const cryptoAnalysis = engine.analyze(rows, { threshold: 56, minimumTrades: 5, rewardRisk: 1.5, forecastHorizons: [1, 6, 42], primaryHorizon: 6, primaryHorizonLabel: "1 gün" });
assert.deepEqual(cryptoAnalysis.forecasts.map((forecast) => forecast.horizon), [1, 6, 42]);
assert.equal(cryptoAnalysis.primaryHorizon, 6);
assert.ok(cryptoAnalysis.agents.some((agent) => agent.name === "Yön Ajanı" && agent.detail.includes("1 gün")));

const strategySuite = engine.analyzeStrategies(rows, { threshold: 56, minimumTrades: 5, rewardRisk: 1.5 });
assert.ok(strategySuite.selected);
assert.equal(strategySuite.strategies.length, 4);
assert.deepEqual(strategySuite.strategies.map((item) => item.id).sort(), ["breakout", "meanReversion", "pullback", "trend"]);
assert.ok(strategySuite.strategies.every((item) => Number.isFinite(item.selectionScore)));

const plan = engine.riskPlan({ capital: 100000, price: 100, atr: 2, riskPct: 0.5, lossStreak: 2 });
assert.equal(plan.adjustedRiskPct, 0.25);
assert.ok(plan.stop < plan.entry);
assert.ok(plan.target2 > plan.target1);

const cappedPlan = engine.riskPlan({ capital: 100000, price: 100, atr: 0.01, riskPct: 2, maxPositionPct: 25 });
assert.ok(cappedPlan.positionValue <= 25000);

const csv = ["time,open,high,low,close,volume", ...rows.slice(0, 80).map((row) => `${row.time},${row.open},${row.high},${row.low},${row.close},${row.volume}`)].join("\n");
assert.equal(engine.parseCsv(csv).length, 80);
console.log("FinPilot engine checks: OK");
