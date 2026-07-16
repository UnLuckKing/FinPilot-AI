importScripts("engine.js", "auto-scanner.js", "crypto-scanner.js", "market-aggregator.js", "signal-tracker.js", "portfolio-risk.js", "decision-intelligence.js", "near-watch.js");

const SCAN_KEY = "finpilotAutomaticScan";
const HISTORY_KEY = "finpilotSignalHistory";
const WATCH_KEY = "finpilotNearWatch";
const JOURNAL_KEY = "finpilotDecisionJournal";
const SETTINGS_KEY = "finpilotResearchSettings";
const ALARM_NAME = "finpilot-bist-auto-scan";
const RESULT_VERSION = 7;
let scanPromise = null;

function normalizeSettings(value) {
  const paperCapital = Number(value?.paperCapital);
  return { paperCapital: Number.isFinite(paperCapital) ? Math.max(1000, Math.min(100_000_000, paperCapital)) : 100000 };
}

function resultNeedsRefresh(result) {
  const age = Date.now() - Date.parse(result?.generatedAt || 0);
  return result?.version !== RESULT_VERSION || !Number.isFinite(age) || age > 4 * 60 * 60 * 1000;
}

function failedMarket(market, error, generatedAt) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    market,
    generatedAt,
    scannedCount: 0,
    requestedCount: 0,
    candidateCount: 0,
    errorCount: 1,
    marketDecision: `YATIRMA · ${market === "bist" ? "BIST" : "kripto"} verisi alınamadı`,
    marketRegime: { gateOpen: false, dataSufficient: false, coveragePct: 0, breadthPct: 0 },
    recommendations: [],
    snapshot: [],
    errors: [{ symbol: market === "bist" ? "BIST" : "BINANCE", message }],
  };
}

async function notifyDecisionChange(previous, current) {
  if (!chrome.notifications?.create) return;
  const previousSymbols = (previous?.recommendations || []).filter((item) => item.eligible).map((item) => `${item.market || "bist"}:${item.symbol}`).sort();
  const currentSymbols = (current?.recommendations || []).filter((item) => item.eligible).map((item) => `${item.market || "bist"}:${item.symbol}`).sort();
  if (previousSymbols.join(",") === currentSymbols.join(",")) return;
  const cleanSymbols = currentSymbols.map((value) => value.split(":").at(-1));
  const title = currentSymbols.length ? "FinPilot · YATIR sinyali" : "FinPilot · YATIRMA";
  const message = currentSymbols.length
    ? `${cleanSymbols.join(", ")} tüm güvenlik kapılarını geçti. Limit ve stop planını panelden kontrol et.`
    : previousSymbols.length ? "Önceki YATIR sinyali koşullar değiştiği için kapatıldı." : "Tüm koşulları geçen varlık bulunmadı.";
  await chrome.notifications.create(`finpilot-${Date.now()}`, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icon.svg"),
    title,
    message,
    priority: 1,
  });
}

async function notifyWatchImprovement(watch) {
  if (!chrome.notifications?.create) return;
  const closer = (watch?.improvements || []).filter((item) => item.kind === "closer" && item.to <= 1);
  if (!closer.length) return;
  const message = closer.slice(0, 4).map((item) => `${item.displaySymbol || item.symbol}: ${item.to} kapı kaldı`).join(" · ");
  await chrome.notifications.create(`finpilot-watch-${Date.now()}`, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icon.svg"),
    title: "FinPilot · YATIR'a yaklaştı",
    message,
    priority: 0,
  });
}

async function notifyLifecycleChanges(previousHistory, currentHistory) {
  if (!chrome.notifications?.create) return;
  const previous = new Map((previousHistory?.records || []).map((record) => [record.id, record.status]));
  const important = new Set(["AKTİF", "TAŞINAN STOP", "HEDEF 2", "STOP", "SÜRESİ DOLDU", "KURULUM BOZULDU"]);
  const changes = (currentHistory?.records || []).filter((record) => important.has(record.status) && previous.get(record.id) !== record.status);
  if (!changes.length) return;
  const message = changes.slice(0, 4).map((record) => `${record.displaySymbol || record.symbol}: ${record.status}`).join(" · ");
  await chrome.notifications.create(`finpilot-lifecycle-${Date.now()}`, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icon.svg"),
    title: "FinPilot · kâğıt işlem güncellendi",
    message,
    priority: 1,
  });
}

function nextFourHourBoundary(now = new Date()) {
  const next = new Date(now);
  next.setUTCMinutes(5, 0, 0);
  const boundaryHour = Math.ceil((now.getUTCHours() + (now.getUTCMinutes() >= 5 ? 1 : 0)) / 4) * 4;
  next.setUTCHours(boundaryHour, 5, 0, 0);
  if (next.getTime() <= now.getTime()) next.setUTCHours(next.getUTCHours() + 4);
  return next.getTime();
}

async function ensureAlarm() {
  const current = await chrome.alarms.get(ALARM_NAME);
  if (!current || current.periodInMinutes !== 240) chrome.alarms.create(ALARM_NAME, { when: nextFourHourBoundary(), periodInMinutes: 240 });
}

async function runAutomaticScan() {
  if (scanPromise) return scanPromise;
  scanPromise = (async () => {
    const startedAt = new Date();
    const storedPromise = chrome.storage.local.get([SCAN_KEY, HISTORY_KEY, WATCH_KEY, JOURNAL_KEY, SETTINGS_KEY]);
    const [bistOutcome, cryptoOutcome] = await Promise.allSettled([
      FinPilotAutoScanner.runScan(),
      FinPilotCryptoScanner.runScan(),
    ]);
    const stored = await storedPromise;
    const previousHistory = stored[HISTORY_KEY] || null;
    const settings = normalizeSettings(stored[SETTINGS_KEY]);
    const bistRaw = bistOutcome.status === "fulfilled" ? bistOutcome.value : failedMarket("bist", bistOutcome.reason, startedAt.toISOString());
    const cryptoRaw = cryptoOutcome.status === "fulfilled" ? cryptoOutcome.value : failedMarket("crypto", cryptoOutcome.reason, startedAt.toISOString());
    const bist = FinPilotSignalTracker.applyPerformanceGuard(bistRaw, previousHistory);
    const crypto = FinPilotSignalTracker.applyPerformanceGuard(cryptoRaw, previousHistory);
    let result = FinPilotMarketAggregator.combineResults(bist, crypto, new Date());
    result = FinPilotDecisionIntelligence.applyRelativeStrength(result);
    result = FinPilotPortfolioRisk.applyPortfolioRisk(result, previousHistory);
    result = FinPilotDecisionIntelligence.applyModelHealth(result, previousHistory);
    result = FinPilotDecisionIntelligence.applyPositionSizingAndStress(result, previousHistory, settings);
    const history = FinPilotSignalTracker.updateHistory(previousHistory, result, new Date());
    const journalUpdate = FinPilotDecisionIntelligence.updateDecisionJournal(stored[SCAN_KEY] || null, result, stored[JOURNAL_KEY] || null, new Date());
    result = journalUpdate.result;
    const watch = FinPilotNearWatch.updateWatch(stored[WATCH_KEY] || null, result, new Date());
    result = FinPilotNearWatch.attachToResult(result, watch);
    result.version = RESULT_VERSION;
    result.signalHistory = history;
    result.settings = settings;
    await chrome.storage.local.set({ [SCAN_KEY]: result, [HISTORY_KEY]: history, [WATCH_KEY]: watch, [JOURNAL_KEY]: journalUpdate.journal, [SETTINGS_KEY]: settings });
    await notifyDecisionChange(stored[SCAN_KEY] || null, result).catch(() => undefined);
    await notifyWatchImprovement(watch).catch(() => undefined);
    await notifyLifecycleChanges(previousHistory, history).catch(() => undefined);
    return result;
  })().finally(() => { scanPromise = null; });
  return scanPromise;
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);
  ensureAlarm().catch(() => undefined);
  runAutomaticScan().catch(() => undefined);
});

chrome.runtime.onStartup.addListener(() => {
  ensureAlarm().catch(() => undefined);
  chrome.storage.local.get(SCAN_KEY).then((stored) => {
    if (resultNeedsRefresh(stored[SCAN_KEY])) runAutomaticScan().catch(() => undefined);
  });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) runAutomaticScan().catch(() => undefined);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "OPEN_FINPILOT_PANEL" && sender.tab?.id) {
    chrome.sidePanel.open({ tabId: sender.tab.id }).catch(() => undefined);
    return false;
  }
  if (message?.type === "GET_AUTOMATIC_SCAN") {
    chrome.storage.local.get([SCAN_KEY, HISTORY_KEY, WATCH_KEY, SETTINGS_KEY]).then(async (stored) => {
      const cached = stored[SCAN_KEY] || null;
      const result = resultNeedsRefresh(cached) ? await runAutomaticScan() : { ...cached, settings: normalizeSettings(stored[SETTINGS_KEY] || cached?.settings), signalHistory: stored[HISTORY_KEY] || cached?.signalHistory || null };
      sendResponse({ ok: true, result });
    }).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === "RUN_AUTOMATIC_SCAN") {
    runAutomaticScan().then((result) => sendResponse({ ok: true, result })).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === "SET_PAPER_CAPITAL") {
    chrome.storage.local.get([SCAN_KEY, HISTORY_KEY, SETTINGS_KEY]).then(async (stored) => {
      const settings = normalizeSettings({ ...(stored[SETTINGS_KEY] || {}), paperCapital: message.paperCapital });
      let result = stored[SCAN_KEY] || null;
      if (result) {
        result = FinPilotDecisionIntelligence.applyPositionSizingAndStress(result, stored[HISTORY_KEY] || result.signalHistory || null, settings);
        result = { ...result, version: RESULT_VERSION, settings, signalHistory: stored[HISTORY_KEY] || result.signalHistory || null };
      }
      await chrome.storage.local.set({ [SETTINGS_KEY]: settings, ...(result ? { [SCAN_KEY]: result } : {}) });
      sendResponse({ ok: true, settings, result });
    }).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  return false;
});
