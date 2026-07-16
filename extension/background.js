importScripts("engine.js", "auto-scanner.js", "crypto-scanner.js", "market-aggregator.js", "signal-tracker.js");

const SCAN_KEY = "finpilotAutomaticScan";
const HISTORY_KEY = "finpilotSignalHistory";
const ALARM_NAME = "finpilot-bist-auto-scan";
const RESULT_VERSION = 4;
let scanPromise = null;

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

async function ensureAlarm() {
  const current = await chrome.alarms.get(ALARM_NAME);
  if (!current || current.periodInMinutes !== 240) chrome.alarms.create(ALARM_NAME, { delayInMinutes: 2, periodInMinutes: 240 });
}

async function runAutomaticScan() {
  if (scanPromise) return scanPromise;
  scanPromise = (async () => {
    const startedAt = new Date();
    const [bistOutcome, cryptoOutcome] = await Promise.allSettled([
      FinPilotAutoScanner.runScan(),
      FinPilotCryptoScanner.runScan(),
    ]);
    const bist = bistOutcome.status === "fulfilled" ? bistOutcome.value : failedMarket("bist", bistOutcome.reason, startedAt.toISOString());
    const crypto = cryptoOutcome.status === "fulfilled" ? cryptoOutcome.value : failedMarket("crypto", cryptoOutcome.reason, startedAt.toISOString());
    const result = FinPilotMarketAggregator.combineResults(bist, crypto, new Date());
    const stored = await chrome.storage.local.get([SCAN_KEY, HISTORY_KEY]);
    const history = FinPilotSignalTracker.updateHistory(stored[HISTORY_KEY] || null, result, new Date());
    result.signalHistory = history;
    await chrome.storage.local.set({ [SCAN_KEY]: result, [HISTORY_KEY]: history });
    await notifyDecisionChange(stored[SCAN_KEY] || null, result).catch(() => undefined);
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
    chrome.storage.local.get([SCAN_KEY, HISTORY_KEY]).then(async (stored) => {
      const cached = stored[SCAN_KEY] || null;
      const result = resultNeedsRefresh(cached) ? await runAutomaticScan() : { ...cached, signalHistory: stored[HISTORY_KEY] || cached?.signalHistory || null };
      sendResponse({ ok: true, result });
    }).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === "RUN_AUTOMATIC_SCAN") {
    runAutomaticScan().then((result) => sendResponse({ ok: true, result })).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  return false;
});
