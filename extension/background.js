importScripts("engine.js", "auto-scanner.js");

const SCAN_KEY = "finpilotAutomaticScan";
const ALARM_NAME = "finpilot-bist-auto-scan";
let scanPromise = null;

async function notifyDecisionChange(previous, current) {
  if (!chrome.notifications?.create) return;
  const previousSymbols = (previous?.recommendations || []).filter((item) => item.eligible).map((item) => item.symbol).sort();
  const currentSymbols = (current?.recommendations || []).filter((item) => item.eligible).map((item) => item.symbol).sort();
  if (previousSymbols.join(",") === currentSymbols.join(",")) return;
  const title = currentSymbols.length ? "FinPilot · YATIR sinyali" : "FinPilot · YATIRMA";
  const message = currentSymbols.length
    ? `${currentSymbols.join(", ")} tüm güvenlik kapılarını geçti. Limit ve stop planını panelden kontrol et.`
    : previousSymbols.length ? "Önceki YATIR sinyali güvenlik koşulları değiştiği için kapatıldı." : "Tüm koşulları geçen hisse bulunmadı.";
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
  if (!current) chrome.alarms.create(ALARM_NAME, { delayInMinutes: 2, periodInMinutes: 720 });
}

async function runAutomaticScan() {
  if (scanPromise) return scanPromise;
  scanPromise = FinPilotAutoScanner.runScan()
    .then(async (result) => {
      const stored = await chrome.storage.local.get(SCAN_KEY);
      await chrome.storage.local.set({ [SCAN_KEY]: result });
      await notifyDecisionChange(stored[SCAN_KEY] || null, result).catch(() => undefined);
      return result;
    })
    .finally(() => { scanPromise = null; });
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
    const age = Date.now() - Date.parse(stored[SCAN_KEY]?.generatedAt || 0);
    if (!Number.isFinite(age) || age > 12 * 60 * 60 * 1000) runAutomaticScan().catch(() => undefined);
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
    chrome.storage.local.get(SCAN_KEY).then(async (stored) => {
      const cached = stored[SCAN_KEY] || null;
      const age = Date.now() - Date.parse(cached?.generatedAt || 0);
      const result = !cached || !Number.isFinite(age) || age > 12 * 60 * 60 * 1000 ? await runAutomaticScan() : cached;
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
