const assert = require("node:assert/strict");
require("./market-aggregator.js");
require("./near-watch.js");
require("./portfolio-risk.js");
require("./decision-intelligence.js");

class FakeElement {
  constructor() {
    this.textContent = "";
    this.innerHTML = "";
    this.hidden = false;
    this.disabled = false;
    this.style = {};
    this.value = "";
    this.listeners = {};
    this.classes = new Set();
    this.classList = { toggle: (name, force) => force ? this.classes.add(name) : this.classes.delete(name) };
  }
  addEventListener(type, callback) { this.listeners[type] = callback; }
}

const ids = [
  "pageStatus", "activeChart", "progressCard", "runScan", "progressTitle", "progressText", "progressFill",
  "emptyState", "resultArea", "marketDecision", "marketMeta", "candidateCount", "marketDecisionCard",
    "scannedCount", "bistScanned", "cryptoScanned", "marketBreadth", "dataAsOf", "generatedAt", "kapCheckedCount", "evidenceACount", "paperOpenCount", "dataHealthCount", "modelHealthStatus", "portfolioStressPct", "paperCapital",
  "tabAll", "tabBist", "tabCrypto", "tabWatch", "tabHistory", "tabJournal", "allCount", "bistCount", "cryptoCount", "watchCount", "historyCount", "journalCount",
  "recommendationTitle", "universeLabel", "recommendations", "historyPanel", "journalPanel", "errorDetails", "errorCount", "errorList",
];
const elements = Object.fromEntries(ids.map((id) => [id, new FakeElement()]));
global.document = { getElementById: (id) => elements[id] };

const forecastsBist = { "1": { available: true, direction: "YATAY", probabilityUp: 38, probabilityDown: 27, probabilityFlat: 35, expectedLowPct: -1.1, expectedHighPct: 1.4 }, "5": { available: true, direction: "YÜKSELİŞ", probabilityUp: 64, probabilityDown: 21, probabilityFlat: 15, expectedLowPct: -0.8, expectedHighPct: 4.2 }, "20": { available: true, direction: "YÜKSELİŞ", probabilityUp: 59, probabilityDown: 25, probabilityFlat: 16, expectedLowPct: -2.4, expectedHighPct: 8.5 } };
const bistItem = {
  market: "bist", marketLabel: "BIST", displaySymbol: "THYAO", priceDecimals: 2, symbol: "THYAO", action: "YATIR", eligible: true, rankScore: 82, price: 312.5, dataDate: "2026-07-15", dataAgeBusinessDays: 1, direction: "YÜKSELİŞ",
  historicalProbability: 54.2, probabilityLow: 41, probabilityHigh: 67, profitFactor: 1.44, recentExpectancyR: 0.18, modelProbabilityUp: 61.4, stress: { available: true, profitablePct: 68 }, fundamental: { available: true, score: 76, status: "Güçlü" }, kap: { available: true, blocked: false, status: "Yakın risk işareti yok" }, forecasts: forecastsBist,
  evidenceGrade: "A", calibratedProbabilityUp: 63, regime: { id: "strongTrend", label: "Güçlü yükseliş trendi" }, challenger: { label: "Geri çekilme" }, decisionDelta: "Rejim ve dönem dışı test trend modelini korudu.", validation: { evidenceGrade: "A", calibratedProbability: 62.5, foldCount: 4, stabilityPct: 75, overfitRisk: "DÜŞÜK", oos: { trades: 24 }, pbo: { available: true, value: 0.17 }, selectedDeflatedSharpe: { available: true, probability: 0.84 } }, portfolioRisk: { maxCorrelation: 0.44, correlatedWith: "ASELS", suggestedRiskPct: 0.4 },
  forecastDisplay: [{ key: "1", label: "1 GÜN" }, { key: "5", label: "5 GÜN" }, { key: "20", label: "20 GÜN" }],
  orderPlan: { limitBuy: 309, stopTrigger: 297, stopLimit: 296, target1: 327, target2: 335, validUntil: "2026-07-16" },
  gates: { setup: true, backtest: true, model: true, validation: true, fundamental: true, direction: true, stress: true, orderPlan: true, dataFresh: true, kap: true, market: true, portfolio: true }, failedGates: [],
  reasons: ["Trend olumlu.", "KAP kontrolü tamamlandı."], links: { tradingView: "https://tr.tradingview.com/chart/?symbol=BIST%3ATHYAO", isYatirim: "https://www.isyatirim.com.tr/", kap: "https://kap.org.tr/tr/bildirim-sorgu" },
};
const cryptoItem = {
  ...bistItem,
  market: "crypto", marketLabel: "KRİPTO", displaySymbol: "BTC", symbol: "BTCUSDT", priceDecimals: 2, price: 118000, action: "YATIRMA", eligible: false, nearMiss: true, rankScore: 74, dataDate: "2026-07-16T08:00:00Z", dataAgeHours: 4,
  fundamental: { available: false }, kap: { available: true, status: "Kriptoda uygulanmaz" }, quoteVolume24h: 2_000_000_000, priceChangePct24h: 2.4,
  forecasts: { "1": forecastsBist["1"], "6": forecastsBist["5"], "42": forecastsBist["20"] }, forecastDisplay: [{ key: "1", label: "4 SAAT" }, { key: "6", label: "1 GÜN" }, { key: "42", label: "7 GÜN" }],
  strategy: { id: "pullback", label: "Geri çekilme", comparisons: [{ id: "trend" }, { id: "pullback" }, { id: "breakout" }, { id: "meanReversion" }] }, autoWatched: true,
  gates: { setup: true, backtest: true, model: true, direction: false, stress: true, liquidity: true, orderPlan: true, dataFresh: true, market: true }, failedGates: [{ key: "direction", label: "Yön", message: "1 gün yükseliş %51/%56 gerekli." }],
  links: { tradingView: "https://tr.tradingview.com/chart/?symbol=BINANCE%3ABTCUSDT", exchange: "https://www.binance.com/en/trade/BTC_USDT?type=spot" },
};

const cached = {
  version: 6, generatedAt: "2026-07-16T09:00:00.000Z", dataAsOf: "2026-07-16T08:00:00Z", universe: "Geniş BIST + Binance likit USDT spot", scannedCount: 230, requestedCount: 260, errorCount: 0, candidateCount: 1, marketDecision: "YATIR · 1 varlık tüm kapıları geçti", research: { kapCheckedCount: 12, deepResearchLimit: 12 }, marketRegime: { gateOpen: true, dataSufficient: true, coveragePct: 88, breadthPct: 53 }, errors: [], recommendations: [bistItem, cryptoItem], snapshot: [], nearWatch: { count: 1, note: "Kapı mesafesi izlenir.", items: [{ key: "crypto:BTCUSDT" }] },
  markets: {
    bist: { universe: "İş Yatırım geniş likit BIST evreni", scannedCount: 100, requestedCount: 120, marketDecision: "YATIR · 1 hisse", marketRegime: { gateOpen: true } },
    crypto: { universe: "Binance likit USDT spot evreni", scannedCount: 130, requestedCount: 140, marketDecision: "YATIRMA · tüm koşulları geçen kripto yok", marketRegime: { gateOpen: true } },
  },
  signalHistory: { stats: { open: 1, pending: 1, active: 0, resolved: 0, totalR: 0, winRate: null, averageR: null }, note: "Gerçek işlem kaydı değildir.", records: [{ key: "bist:THYAO", market: "bist", marketLabel: "BIST", symbol: "THYAO", displaySymbol: "THYAO", createdAt: "2026-07-16T08:00:00Z", entry: 309, lastPrice: 312.5, status: "EMİR BEKLİYOR" }] },
  decisionJournal: { entries: [{ at: "2026-07-16T09:00:00Z", market: "bist", symbol: "THYAO", displaySymbol: "THYAO", action: "YATIR", summary: "karar YATIRMA → YATIR", next: "Limit emri koşulu izleniyor." }] },
};

global.chrome = {
  runtime: { lastError: null, sendMessage(_message, callback) { callback({ ok: true, result: cached }); } },
  tabs: { query: async () => [{ title: "THYAO", url: "https://tr.tradingview.com/chart/?symbol=BIST%3ATHYAO" }] },
  storage: { local: { get: async () => ({}), set: async () => undefined } },
};

require("./panel.js");

setTimeout(() => {
  try {
    assert.equal(elements.marketDecision.textContent, "YATIR · 1 varlık tüm kapıları geçti");
    assert.equal(elements.candidateCount.textContent, 1);
    assert.equal(elements.marketBreadth.textContent, "%53");
    assert.equal(elements.bistScanned.textContent, "100/120");
    assert.equal(elements.cryptoScanned.textContent, "130/140");
    assert.equal(elements.resultArea.hidden, false);
    assert.match(elements.recommendations.innerHTML, /THYAO/);
    assert.match(elements.recommendations.innerHTML, /BTC/);
    assert.match(elements.recommendations.innerHTML, /Alış limiti/);
    assert.match(elements.recommendations.innerHTML, /YATIR'A 1 KAPI KALDI/);
    assert.match(elements.recommendations.innerHTML, /1 gün yükseliş %51\/%56 gerekli/);
    assert.match(elements.recommendations.innerHTML, /Geri çekilme/);
    assert.match(elements.recommendations.innerHTML, /NE DEĞİŞMELİ|YATIR'A 1 KAPI KALDI/);
    assert.match(elements.recommendations.innerHTML, /KANIT DOSYASI v3\.1/);
    assert.match(elements.recommendations.innerHTML, /Walk-forward/);
    assert.match(elements.recommendations.innerHTML, /KÂĞIT EMİR/);
    assert.equal(elements.kapCheckedCount.textContent, "12/12");
    assert.equal(elements.watchCount.textContent, 1);
    assert.equal(elements.evidenceACount.textContent, 2);
    assert.equal(elements.paperOpenCount.textContent, 1);
    elements.tabCrypto.listeners.click();
    assert.match(elements.recommendations.innerHTML, /BTC/);
    assert.doesNotMatch(elements.recommendations.innerHTML, /THYAO/);
    elements.tabWatch.listeners.click();
    assert.match(elements.recommendations.innerHTML, /Otomatik takipte/);
    elements.tabHistory.listeners.click();
    assert.equal(elements.historyPanel.hidden, false);
    assert.match(elements.historyPanel.innerHTML, /Gerçek işlem kaydı değildir/);
    elements.tabJournal.listeners.click();
    assert.equal(elements.journalPanel.hidden, false);
    assert.match(elements.journalPanel.innerHTML, /karar YATIRMA → YATIR/);
    assert.equal(elements.journalCount.textContent, 1);
    assert.equal(elements.runScan.disabled, false);
    assert.equal(typeof elements.runScan.listeners.click, "function");
    console.log("FinPilot panel runtime checks: OK");
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}, 40);
