importScripts("engine.js", "auto-scanner.js", "crypto-scanner.js", "market-aggregator.js", "signal-tracker.js", "near-watch.js");

const SCAN_KEY = "finpilotAutomaticScan";
const HISTORY_KEY = "finpilotSignalHistory";
const WATCH_KEY = "finpilotNearWatch";
const ALARM_NAME = "finpilot-bist-auto-scan";
const RESULT_VERSION = 5;
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
    const storedPromise = chrome.storage.local.get([SCAN_KEY, HISTORY_KEY, WATCH_KEY]);
    const [bistOutcome, cryptoOutcome] = await Promise.allSettled([
      FinPilotAutoScanner.runScan(),
      FinPilotCryptoScanner.runScan(),
    ]);
    const stored = await storedPromise;
    const previousHistory = stored[HISTORY_KEY] || null;
    const bistRaw = bistOutcome.status === "fulfilled" ? bistOutcome.value : failedMarket("bist", bistOutcome.reason, startedAt.toISOString());
    const cryptoRaw = cryptoOutcome.status === "fulfilled" ? cryptoOutcome.value : failedMarket("crypto", cryptoOutcome.reason, startedAt.toISOString());
    const bist = FinPilotSignalTracker.applyPerformanceGuard(bistRaw, previousHistory);
    const crypto = FinPilotSignalTracker.applyPerformanceGuard(cryptoRaw, previousHistory);
    let result = FinPilotMarketAggregator.combineResults(bist, crypto, new Date());
    const history = FinPilotSignalTracker.updateHistory(previousHistory, result, new Date());
    const watch = FinPilotNearWatch.updateWatch(stored[WATCH_KEY] || null, result, new Date());
    result = FinPilotNearWatch.attachToResult(result, watch);
    result.signalHistory = history;
    await chrome.storage.local.set({ [SCAN_KEY]: result, [HISTORY_KEY]: history, [WATCH_KEY]: watch });
    await notifyDecisionChange(stored[SCAN_KEY] || null, result).catch(() => undefined);
    await notifyWatchImprovement(watch).catch(() => undefined);
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
    chrome.storage.local.get([SCAN_KEY, HISTORY_KEY, WATCH_KEY]).then(async (stored) => {
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
