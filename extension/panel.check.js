const assert = require("node:assert/strict");

class FakeElement {
  constructor() {
    this.textContent = "";
    this.innerHTML = "";
    this.hidden = false;
    this.disabled = false;
    this.style = {};
    this.listeners = {};
    this.classList = { toggle: () => undefined };
  }
  addEventListener(type, callback) { this.listeners[type] = callback; }
}

const ids = [
  "pageStatus", "activeChart", "progressCard", "runScan", "progressTitle", "progressText", "progressFill",
  "emptyState", "resultArea", "marketDecision", "marketMeta", "candidateCount", "marketDecisionCard",
  "scannedCount", "marketBreadth", "dataAsOf", "generatedAt", "kapCheckedCount", "universeLabel", "recommendations", "errorDetails", "errorCount", "errorList",
];
const elements = Object.fromEntries(ids.map((id) => [id, new FakeElement()]));
global.document = { getElementById: (id) => elements[id] };

const cached = {
  version: 3,
  generatedAt: "2026-07-16T09:00:00.000Z",
  dataAsOf: "2026-07-15",
  universe: "FinPilot likit BIST havuzu",
  scannedCount: 30,
  requestedCount: 30,
  errorCount: 0,
  candidateCount: 1,
  marketDecision: "YATIR · 1 hisse tüm kapıları geçti",
  research: { kapCheckedCount: 1, deepResearchLimit: 6 },
  marketRegime: { gateOpen: true, dataSufficient: true, coveragePct: 100, breadthPct: 63, positiveTrendCount: 19, sampleSize: 30 },
  errors: [],
  recommendations: [{
    symbol: "THYAO", action: "YATIR", eligible: true, rankScore: 82, price: 312.5, dataDate: "2026-07-15", dataAgeBusinessDays: 1, direction: "YÜKSELİŞ",
    historicalProbability: 54.2, probabilityLow: 41, probabilityHigh: 67, profitFactor: 1.44, expectancyR: 0.22,
    recentExpectancyR: 0.18, modelProbabilityUp: 61.4, modelAccuracy: 56.8, stress: { available: true, profitablePct: 68 }, fundamental: { available: true, score: 76, status: "Güçlü", sector: "Havayolları" }, kap: { available: true, blocked: false, status: "Yakın risk işareti yok" },
    forecasts: { "1": { available: true, direction: "YATAY", probabilityUp: 38, probabilityDown: 27, probabilityFlat: 35, expectedLowPct: -1.1, expectedHighPct: 1.4 }, "5": { available: true, direction: "YÜKSELİŞ", probabilityUp: 64, probabilityDown: 21, probabilityFlat: 15, expectedLowPct: -0.8, expectedHighPct: 4.2 }, "20": { available: true, direction: "YÜKSELİŞ", probabilityUp: 59, probabilityDown: 25, probabilityFlat: 16, expectedLowPct: -2.4, expectedHighPct: 8.5 } },
    orderPlan: { limitBuy: 309, stopTrigger: 297, stopLimit: 296, target1: 327, target2: 335, validUntil: "2026-07-16" },
    gates: { setup: true, backtest: true, model: true, fundamental: true, direction: true, stress: true, orderPlan: true, dataFresh: true, kap: true, market: true },
    reasons: ["Trend olumlu.", "Momentum olumlu.", "Geçmiş avantaj pozitif.", "Yerel ML teyidi geçti."],
    links: { tradingView: "https://tr.tradingview.com/chart/?symbol=BIST%3ATHYAO", isYatirim: "https://www.isyatirim.com.tr/", kap: "https://kap.org.tr/tr/bildirim-sorgu" },
  }],
};
cached.recommendations.push({
  ...cached.recommendations[0],
  symbol: "ASELS",
  action: "YATIRMA",
  eligible: false,
  gates: { ...cached.recommendations[0].gates, kap: false },
});

global.chrome = {
  runtime: {
    lastError: null,
    sendMessage(_message, callback) { callback({ ok: true, result: cached }); },
  },
  tabs: { query: async () => [{ title: "THYAO", url: "https://tr.tradingview.com/chart/?symbol=BIST%3ATHYAO" }] },
  storage: { local: { get: async () => ({}), set: async () => undefined } },
};

require("./panel.js");

setTimeout(() => {
  try {
    assert.equal(elements.marketDecision.textContent, "YATIR · 1 hisse tüm kapıları geçti");
    assert.equal(elements.candidateCount.textContent, 1);
    assert.equal(elements.marketBreadth.textContent, "%63");
    assert.equal(elements.resultArea.hidden, false);
    assert.equal(elements.emptyState.hidden, true);
    assert.match(elements.recommendations.innerHTML, /THYAO/);
    assert.match(elements.recommendations.innerHTML, /Temel puan/);
    assert.match(elements.recommendations.innerHTML, /Alış limiti/);
    assert.match(elements.recommendations.innerHTML, /Stop-limit/);
    assert.match(elements.recommendations.innerHTML, /Emir seviyesi aktif değil/);
    assert.match(elements.recommendations.innerHTML, /YÜKSELİŞ/);
    assert.equal(elements.kapCheckedCount.textContent, "1/6");
    assert.equal(elements.runScan.disabled, false);
    assert.equal(typeof elements.runScan.listeners.click, "function");
    console.log("FinPilot panel runtime checks: OK");
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}, 30);
