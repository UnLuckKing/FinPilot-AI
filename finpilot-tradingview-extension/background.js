import { analyzeBundle, computeEvidence, HORIZONS, SIDES, VERDICTS } from "./lib/engine.js";
import { discoverKapBistSymbols, discoverYahooUsSymbols } from "./lib/discovery.js";
import { advanceCandidate, LIFE_STATES } from "./lib/lifecycle.js";
import { discoverBinanceSpotSymbols, fetchDailyFrame, fetchMarketBundle } from "./lib/providers.js";
import { prescreenSymbols } from "./lib/prefilter.js";
import { evaluatePlanB, quantityForRisk } from "./lib/risk.js";
import { parseTradingViewSymbol, sanitizeSymbolList } from "./lib/symbols.js";
import { getMarketUniverse, marketCategoryCounts } from "./lib/universe.js";

const STORAGE = Object.freeze({
  contexts: "contextsByTab",
  latest: "latestBySymbol",
  candidates: "candidateSignals",
  outcomes: "signalOutcomes",
  logs: "activityLog",
  scanProgress: "marketScanProgress",
  scanResults: "marketScanResults",
  inbox: "opportunityInbox",
  cryptoUniverse: "cryptoUniverse",
  bistUniverse: "bistUniverse",
  usUniverse: "usUniverse",
  bistShortlist: "bistDailyShortlist"
});

const bundleCache = new Map();
let scanGeneration = 0;
let marketScanPromise = null;

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  await ensureAlarms();
  void startGlobalMarketScan();
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureAlarms();
  void startGlobalMarketScan();
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!tab.url) return;
  const enabled = isTradingViewUrl(tab.url);
  await chrome.sidePanel.setOptions({ tabId, path: "sidepanel.html", enabled }).catch(() => {});
  if (enabled && (changeInfo.status === "loading" || changeInfo.url)) await removeTabContext(tabId);
  if (!enabled && changeInfo.status === "complete") await removeTabContext(tabId);
});

chrome.tabs.onRemoved.addListener(removeTabContext);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "finpilot-track") void updateTrackedSignals();
  if (alarm.name === "finpilot-market-scan") void startGlobalMarketScan();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== "object") return false;
  const action = String(message.action ?? "");

  if (action === "TV_CONTEXT") {
    runAsync(sendResponse, async () => {
      assertTradingViewSender(sender);
      const context = normalizeContext(message.context);
      if (!context) throw new Error("Geçerli TradingView sembolü bulunamadı");
      await storeContext(sender.tab?.id, context);
      const result = await analyzeAndStore(context.symbol, { notifyOnInvest: true });
      return { ok: true, context, result };
    });
    return true;
  }

  if (action === "GET_ACTIVE_CONTEXT") {
    runAsync(sendResponse, async () => ({ ok: true, context: await activeContext() }));
    return true;
  }

  if (action === "ANALYZE_ACTIVE") {
    runAsync(sendResponse, async () => {
      const context = await activeContext();
      if (!context?.symbol) throw new Error("TradingView grafiğinde sembol algılanamadı");
      return { ok: true, context, result: await analyzeAndStore(context.symbol) };
    });
    return true;
  }

  if (action === "ANALYZE_SYMBOL") {
    runAsync(sendResponse, async () => {
      const parsed = parseTradingViewSymbol(message.symbol);
      if (!parsed) throw new Error("Geçerli sembol yok");
      return { ok: true, result: await analyzeAndStore(parsed.full) };
    });
    return true;
  }

  if (action === "OPEN_CHART_SYMBOL") {
    runAsync(sendResponse, async () => {
      const parsed = parseTradingViewSymbol(message.symbol);
      if (!parsed?.exchange) throw new Error("Grafikte açılacak geçerli sembol yok");
      const tab = await activeTradingViewTab();
      if (!tab?.id || !tab.url) throw new Error("Aktif TradingView sekmesi yok");
      const url = new URL(tab.url);
      url.searchParams.set("symbol", parsed.full);
      await removeTabContext(tab.id);
      await chrome.tabs.update(tab.id, { url: url.toString() });
      return { ok: true, symbol: parsed.full, url: url.toString() };
    });
    return true;
  }

  if (action === "SCAN_SYMBOLS") {
    runAsync(sendResponse, async () => {
      const symbols = sanitizeSymbolList(message.symbols, 30);
      if (symbols.length === 0) throw new Error("TradingView izleme listesinde okunabilir sembol bulunamadı");
      const results = await scanSymbols(symbols);
      return { ok: true, results };
    });
    return true;
  }

  if (action === "GET_MARKET_CATEGORIES") {
    runAsync(sendResponse, async () => {
      const sources = await dynamicMarketSources();
      return { ok: true, counts: marketCategoryCounts(sources) };
    });
    return true;
  }

  if (action === "SCAN_MARKET") {
    runAsync(sendResponse, async () => {
      const scan = await startGlobalMarketScan({ force: Boolean(message.force) });
      return { ok: true, category: "ALL", ...scan };
    });
    return true;
  }

  if (action === "GET_DASHBOARD") {
    runAsync(sendResponse, async () => {
      const stored = await chrome.storage.local.get([
        STORAGE.latest,
        STORAGE.candidates,
        STORAGE.outcomes,
        STORAGE.logs,
        STORAGE.scanProgress,
        STORAGE.scanResults,
        STORAGE.inbox
      ]);
      const outcomes = stored[STORAGE.outcomes] ?? [];
      return {
        ok: true,
        latest: stored[STORAGE.latest] ?? {},
        candidates: stored[STORAGE.candidates] ?? [],
        outcomes,
        evidence: computeEvidence(outcomes),
        logs: stored[STORAGE.logs] ?? [],
        scanProgress: stored[STORAGE.scanProgress] ?? null,
        scanResults: stored[STORAGE.scanResults] ?? [],
        inbox: stored[STORAGE.inbox] ?? []
      };
    });
    return true;
  }

  if (action === "CLEAR_LOCAL_HISTORY") {
    runAsync(sendResponse, async () => {
      await chrome.storage.local.remove([STORAGE.candidates, STORAGE.outcomes, STORAGE.logs, STORAGE.inbox]);
      return { ok: true };
    });
    return true;
  }

  if (action === "EXTRACT_WATCHLIST") {
    runAsync(sendResponse, async () => {
      const tab = await activeTradingViewTab();
      if (!tab?.id) throw new Error("Aktif TradingView sekmesi yok");
      const response = await messageTradingViewTab(tab, { action: "EXTRACT_WATCHLIST" });
      return { ok: true, symbols: sanitizeSymbolList(response?.symbols, 30) };
    });
    return true;
  }

  return false;
});

async function analyzeAndStore(symbol, options = {}) {
  const parsed = parseTradingViewSymbol(symbol);
  if (!parsed) throw new Error("Sembol biçimi geçersiz");
  const before = options.scanMode
    ? { [STORAGE.outcomes]: options.outcomes ?? [] }
    : await chrome.storage.local.get([STORAGE.latest, STORAGE.outcomes]);
  const previous = before[STORAGE.latest]?.[parsed.full];
  let result;
  try {
    const bundle = await cachedMarketBundle(parsed.full);
    result = applyRiskControls(analyzeBundle(bundle), before[STORAGE.outcomes] ?? []);
  } catch (error) {
    result = failureResult(parsed.full, error);
  }

  if (options.scanMode) {
    return result;
  }

  const latest = { ...(before[STORAGE.latest] ?? {}), [parsed.full]: result };
  const entries = Object.entries(latest)
    .sort(([, left], [, right]) => Date.parse(right.analyzedAt) - Date.parse(left.analyzedAt))
    .slice(0, 80);
  await chrome.storage.local.set({ [STORAGE.latest]: Object.fromEntries(entries) });
  await appendLog(`${parsed.full}: ${result.verdict}`);
  await registerCandidate(result);

  const confirmedSignal = [VERDICTS.INVEST, VERDICTS.SHORT].includes(result.verdict) && result.actionable;
  if (options.notifyOnInvest && confirmedSignal && previous?.verdict !== result.verdict) {
    await chrome.notifications.create(`finpilot-${result.id}`, {
      type: "basic",
      iconUrl: "assets/icon128.png",
      title: `${result.symbol} · ${result.decisionLabel ?? result.verdict}`,
      message: `${result.horizonLabel ?? "15 DK"} · ${result.tradeSide} · Güç ${result.technicalScore}/100 · Giriş ${price(result.plan?.entryLow)}–${price(result.plan?.entryHigh)} · Stop ${price(result.plan?.stop)}`
    }).catch(() => {});
  }
  return result;
}

async function startGlobalMarketScan(options = {}) {
  if (marketScanPromise && !options.force) return marketScanPromise;
  if (options.force) scanGeneration += 1;
  const generation = ++scanGeneration;
  marketScanPromise = runGlobalMarketScan(generation)
    .finally(() => {
      if (generation === scanGeneration) marketScanPromise = null;
    });
  return marketScanPromise;
}

async function runGlobalMarketScan(generation) {
  const startedAt = new Date().toISOString();
  await setScanProgress({
    category: "ALL",
    stage: "DISCOVERY",
    status: "RUNNING",
    discovered: 0,
    shortlisted: 0,
    total: 0,
    completed: 0,
    startedAt
  }, []);

  const sources = await dynamicMarketSources();
  if (generation !== scanGeneration) return cancelledScan();
  const counts = marketCategoryCounts(sources);
  const discovered = counts.ALL;
  await setScanProgress({
    category: "ALL",
    stage: "PREFILTER",
    status: "RUNNING",
    discovered,
    discoveredCounts: counts,
    screenTotal: counts.BIST,
    screened: 0,
    total: 0,
    completed: 0,
    startedAt,
    updatedAt: new Date().toISOString()
  });

  const bistUniverse = getMarketUniverse("BIST", sources);
  const bistShortlist = await rankedBistShortlist(bistUniverse, {
    generation,
    discovered,
    counts,
    startedAt
  });
  if (generation !== scanGeneration) return cancelledScan();

  const usPriority = unique([...(sources.US ?? []), ...getMarketUniverse("US")]).slice(0, 140);
  const cryptoPriority = getMarketUniverse("CRYPTO", sources).slice(0, 140);
  const forex = getMarketUniverse("FOREX");
  const macro = getMarketUniverse("MACRO");
  const symbols = unique([
    ...bistShortlist,
    ...usPriority,
    ...cryptoPriority,
    ...forex,
    ...macro
  ]);
  const coverage = {
    BIST: bistShortlist.length,
    US: usPriority.length,
    CRYPTO: cryptoPriority.length,
    FOREX: forex.length,
    MACRO: macro.length
  };
  const results = await scanSymbols(symbols, {
    category: "ALL",
    generation,
    marketScan: true,
    discovered,
    discoveredCounts: counts,
    shortlisted: symbols.length,
    coverage,
    startedAt
  });
  return {
    total: symbols.length,
    discovered,
    shortlisted: symbols.length,
    counts,
    coverage,
    results
  };
}

async function rankedBistShortlist(symbols, context) {
  const stored = await chrome.storage.local.get(STORAGE.bistShortlist);
  const cached = stored[STORAGE.bistShortlist];
  const fresh = cached?.symbols?.length >= 50 &&
    Date.now() - Date.parse(cached.updatedAt) < 4 * 60 * 60_000;
  if (fresh) return unique(cached.symbols).slice(0, 120);

  const ranked = await prescreenSymbols(symbols, {
    fetchDaily: (symbol) => fetchDailyFrame(symbol),
    concurrency: 6,
    limit: 120,
    cancelled: () => context.generation !== scanGeneration,
    onProgress: async (progress) => {
      if (context.generation !== scanGeneration) return;
      await setScanProgress({
        category: "ALL",
        stage: "PREFILTER",
        status: "RUNNING",
        discovered: context.discovered,
        discoveredCounts: context.counts,
        screenTotal: progress.total,
        screened: progress.completed,
        screenValid: progress.valid,
        screenFailures: progress.dataFailures,
        total: 0,
        completed: 0,
        startedAt: context.startedAt,
        updatedAt: new Date().toISOString()
      });
    }
  });
  const selected = ranked.candidates.map((item) => item.symbol);
  const fallback = unique([...selected, ...getMarketUniverse("BIST")]).slice(0, 120);
  await chrome.storage.local.set({
    [STORAGE.bistShortlist]: {
      symbols: fallback,
      valid: ranked.valid,
      dataFailures: ranked.dataFailures,
      updatedAt: new Date().toISOString()
    }
  });
  return fallback;
}

async function scanSymbols(symbols, options = {}) {
  const results = [];
  const total = symbols.length;
  const startedAt = new Date().toISOString();
  const storedEvidence = await chrome.storage.local.get(STORAGE.outcomes);
  const outcomes = storedEvidence[STORAGE.outcomes] ?? [];
  if (options.marketScan) {
    await chrome.storage.local.set({
      [STORAGE.scanProgress]: {
        category: options.category,
        stage: "DEEP_ANALYSIS",
        total,
        completed: 0,
        status: "RUNNING",
        startedAt: options.startedAt ?? startedAt,
        discovered: options.discovered ?? total,
        discoveredCounts: options.discoveredCounts,
        shortlisted: options.shortlisted ?? total,
        coverage: options.coverage
      },
      [STORAGE.scanResults]: []
    });
  }

  for (let index = 0; index < symbols.length; index += 5) {
    if (options.generation && options.generation !== scanGeneration) break;
    const batch = symbols.slice(index, index + 5);
    const batchResults = await Promise.all(batch.map((symbol) => analyzeAndStore(symbol, {
      scanMode: options.marketScan,
      outcomes
    })));
    if (options.marketScan) {
      for (const result of batchResults) await registerCandidate(result);
    }
    results.push(...batchResults);
    if (options.generation && options.generation !== scanGeneration) break;
    if (options.marketScan) {
      const sorted = sortResults(results);
      await chrome.storage.local.set({
        [STORAGE.scanProgress]: {
          category: options.category,
          stage: "DEEP_ANALYSIS",
          total,
          completed: Math.min(index + batch.length, total),
          status: "RUNNING",
          startedAt: options.startedAt ?? startedAt,
          discovered: options.discovered ?? total,
          discoveredCounts: options.discoveredCounts,
          shortlisted: options.shortlisted ?? total,
          coverage: options.coverage,
          updatedAt: new Date().toISOString()
        },
        [STORAGE.scanResults]: sorted
      });
    }
  }
  const sorted = sortResults(results);
  if (options.marketScan && (!options.generation || options.generation === scanGeneration)) {
    await chrome.storage.local.set({
      [STORAGE.scanProgress]: {
        category: options.category,
        stage: "COMPLETED",
        total,
        completed: sorted.length,
        status: "COMPLETED",
        startedAt: options.startedAt ?? startedAt,
        discovered: options.discovered ?? total,
        discoveredCounts: options.discoveredCounts,
        shortlisted: options.shortlisted ?? total,
        coverage: options.coverage,
        finishedAt: new Date().toISOString()
      },
      [STORAGE.scanResults]: sorted
    });
    await updateOpportunityInbox(sorted);
  }
  return sorted;
}

async function setScanProgress(progress, results) {
  const values = { [STORAGE.scanProgress]: progress };
  if (results) values[STORAGE.scanResults] = results;
  await chrome.storage.local.set(values);
}

function cancelledScan() {
  return { total: 0, discovered: 0, shortlisted: 0, counts: {}, coverage: {}, results: [] };
}

async function registerCandidate(result) {
  const stored = await chrome.storage.local.get([STORAGE.candidates, STORAGE.outcomes]);
  const candidates = stored[STORAGE.candidates] ?? [];
  const outcomes = stored[STORAGE.outcomes] ?? [];
  const decisions = result.horizons
    ? Object.values(result.horizons)
    : [result];
  let changed = false;

  for (const decision of decisions) {
    if (
      ![VERDICTS.INVEST, VERDICTS.OPTIONAL, VERDICTS.SHORT, VERDICTS.SHORT_OPTIONAL].includes(decision?.verdict) ||
      !decision?.actionable ||
      !decision.plan ||
      !decision.barTime
    ) continue;
    if (candidates.some((item) => item.id === decision.id) || outcomes.some((item) => item.id === decision.id)) continue;
    if (candidates.some((item) =>
      item.symbol === result.symbol &&
      item.side === decision.tradeSide &&
      item.horizon === decision.horizon
    )) continue;
    if (decision.planB?.allowNew === false) continue;

    const createdAt = Date.parse(decision.barTime);
    const entryValidityMs = Number(decision.plan.entryValidityMs) ||
      (decision.horizon === HORIZONS.SWING ? 2 * 24 * 60 * 60_000 : 4 * 15 * 60_000);
    candidates.unshift({
      id: decision.id,
      symbol: result.symbol,
      verdict: decision.verdict,
      decisionLabel: decision.decisionLabel,
      side: decision.tradeSide,
      horizon: decision.horizon,
      horizonLabel: decision.horizonLabel,
      setup: decision.setup,
      setupCode: decision.setupCode,
      technicalScore: decision.technicalScore,
      createdAt: decision.barTime,
      entryExpiresAt: new Date(createdAt + entryValidityMs).toISOString(),
      maxHoldingMs: decision.plan.maxHoldingMs,
      entryMaxBars: decision.plan.entryMaxBars,
      maxHoldingBars: decision.plan.maxHoldingBars,
      barsSinceSignal: 0,
      holdingBars: 0,
      plan: decision.plan,
      trigger: decision.trigger,
      state: [VERDICTS.OPTIONAL, VERDICTS.SHORT_OPTIONAL].includes(decision.verdict)
        ? LIFE_STATES.WAITING_TRIGGER
        : LIFE_STATES.WAITING_ENTRY,
      status: "OPEN",
      events: []
    });
    changed = true;
  }
  if (changed) await chrome.storage.local.set({ [STORAGE.candidates]: candidates.slice(0, 160) });
}

async function updateTrackedSignals() {
  const stored = await chrome.storage.local.get([STORAGE.candidates, STORAGE.outcomes]);
  const candidates = stored[STORAGE.candidates] ?? [];
  const outcomes = stored[STORAGE.outcomes] ?? [];
  if (candidates.length === 0) return;
  const grouped = new Map();
  for (const candidate of candidates) {
    const list = grouped.get(candidate.symbol) ?? [];
    list.push(candidate);
    grouped.set(candidate.symbol, list);
  }

  const open = [];
  const closed = [];
  for (const [symbol, items] of grouped.entries()) {
    let bundle;
    try {
      bundle = await cachedMarketBundle(symbol);
    } catch {
      open.push(...items);
      continue;
    }
    for (const candidate of items) {
      const bars = candidate.horizon === HORIZONS.SWING
        ? bundle.frames?.day ?? []
        : bundle.frames?.fifteen ?? [];
      const transition = advanceCandidate(candidate, bars);
      if (transition.outcome) closed.push(transition.outcome);
      else if (transition.candidate) open.push(transition.candidate);
      await notifyLifecycleEvents(candidate, transition.events);
    }
  }
  await chrome.storage.local.set({
    [STORAGE.candidates]: open.slice(0, 100),
    [STORAGE.outcomes]: [...closed, ...outcomes].slice(0, 500)
  });
}

function applyRiskControls(result, outcomes) {
  if (!result?.plan && !result?.horizons) return result;
  const applyDecision = (decision) => {
    if (!decision?.plan) return decision;
    const planB = evaluatePlanB({ ...decision, symbol: result.symbol }, outcomes);
    const plan = {
      ...decision.plan,
      riskPercent: planB.riskPercent,
      quantityPer100k: quantityForRisk(decision.plan, planB.riskPercent)
    };
    const next = { ...decision, plan, planB };
    if (planB.allowNew === false && next.actionable) {
      next.rawVerdict = next.verdict;
      next.rawDecisionLabel = next.decisionLabel;
      next.verdict = VERDICTS.WAIT;
      next.decisionLabel = `PLAN B · ${planB.status}`;
      next.verdictCode = 2;
      next.actionable = false;
      next.signalState = planB.status;
      next.blockers = [planB.reason, ...(next.blockers ?? [])];
    }
    return next;
  };

  if (!result.horizons) return applyDecision(result);
  const horizons = {
    intraday: applyDecision(result.horizons.intraday),
    swing: applyDecision(result.horizons.swing)
  };
  const primary = [horizons.intraday, horizons.swing].sort((left, right) =>
    Number(right?.verdictCode ?? -1) - Number(left?.verdictCode ?? -1) ||
    Number(right?.opportunityScore ?? 0) - Number(left?.opportunityScore ?? 0) ||
    Number(right?.technicalScore ?? 0) - Number(left?.technicalScore ?? 0)
  )[0];
  return {
    ...result,
    ...primary,
    horizons,
    primaryHorizon: primary?.horizon ?? result.primaryHorizon
  };
}

async function updateOpportunityInbox(results) {
  const stored = await chrome.storage.local.get(STORAGE.inbox);
  const previous = stored[STORAGE.inbox] ?? [];
  const firstRun = previous.length === 0;
  const now = Date.now();
  const decisions = results.flatMap((result) => {
    const horizons = result.horizons ? Object.values(result.horizons) : [result];
    return horizons.map((decision) => ({ ...decision, symbol: result.symbol, market: result.market }));
  }).filter((decision) =>
    decision.actionable &&
    decision.verdictCode >= 3 &&
    decision.planB?.allowNew !== false
  ).sort((left, right) =>
    Number(right.verdictCode) - Number(left.verdictCode) ||
    Number(right.opportunityScore) - Number(left.opportunityScore)
  );

  const additions = [];
  for (const decision of decisions.slice(0, 20)) {
    const dedupeMs = decision.horizon === HORIZONS.SWING ? 24 * 60 * 60_000 : 60 * 60_000;
    const duplicate = [...previous, ...additions].some((item) =>
      item.symbol === decision.symbol &&
      item.horizon === decision.horizon &&
      item.side === decision.tradeSide &&
      item.setupCode === decision.setupCode &&
      now - Date.parse(item.createdAt) < dedupeMs
    );
    if (duplicate) continue;
    additions.push({
      id: `inbox-${decision.id}`,
      resultId: decision.id,
      symbol: decision.symbol,
      market: decision.market,
      horizon: decision.horizon,
      horizonLabel: decision.horizonLabel,
      side: decision.tradeSide,
      verdict: decision.verdict,
      decisionLabel: decision.decisionLabel,
      verdictCode: decision.verdictCode,
      setup: decision.setup,
      setupCode: decision.setupCode,
      technicalScore: decision.technicalScore,
      opportunityScore: decision.opportunityScore,
      plan: decision.plan,
      createdAt: new Date().toISOString()
    });
  }
  if (additions.length === 0) return;
  await chrome.storage.local.set({ [STORAGE.inbox]: [...additions, ...previous].slice(0, 60) });
  if (firstRun) return;
  for (const item of additions.filter((entry) => entry.verdictCode !== 3).slice(0, 3)) {
    await chrome.notifications.create(item.id, {
      type: "basic",
      iconUrl: "assets/icon128.png",
      title: `Yeni fırsat · ${item.symbol}`,
      message: `${item.decisionLabel} · ${item.setup} · Giriş ${price(item.plan?.entryLow)}–${price(item.plan?.entryHigh)}`
    }).catch(() => {});
  }
}

async function notifyLifecycleEvents(previous, events) {
  const event = events?.at(-1);
  if (!event || !["ENTRY", "TARGET1", "TARGET2", "STOP", "BREAKEVEN", "TIME_EXIT"].includes(event.type)) return;
  await chrome.notifications.create(`finpilot-life-${previous.id}-${event.type}-${Date.parse(event.at)}`, {
    type: "basic",
    iconUrl: "assets/icon128.png",
    title: `${previous.symbol} · ${event.message}`,
    message: `Otomatik kâğıt takip · ${previous.horizonLabel ?? previous.horizon} · ${previous.side} · ${price(event.price)}`
  }).catch(() => {});
}

async function activeContext() {
  const tab = await activeTradingViewTab();
  if (!tab?.id) return null;
  try {
    const response = await messageTradingViewTab(tab, { action: "GET_TV_CONTEXT" });
    const context = normalizeContext(response?.context);
    if (context) {
      await storeContext(tab.id, context);
      return context;
    }
  } catch {
    // A very recent stored context remains a final fallback while TradingView is loading.
  }
  const stored = await chrome.storage.local.get(STORAGE.contexts);
  const context = stored[STORAGE.contexts]?.[String(tab.id)] ?? null;
  const age = Date.now() - Date.parse(context?.detectedAt);
  return Number.isFinite(age) && age <= 15_000 ? context : null;
}

async function messageTradingViewTab(tab, message) {
  if (!tab?.id) throw new Error("TradingView sekmesi bulunamadı");
  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch (firstError) {
    if (!chrome.scripting?.executeScript) throw firstError;
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["lib/detection-global.js", "content-script.js"]
    });
    await delay(80);
    return chrome.tabs.sendMessage(tab.id, message);
  }
}

async function activeTradingViewTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs.find((tab) => isTradingViewUrl(tab.url));
}

async function storeContext(tabId, context) {
  if (!Number.isInteger(tabId)) return;
  const stored = await chrome.storage.local.get(STORAGE.contexts);
  const contexts = { ...(stored[STORAGE.contexts] ?? {}), [String(tabId)]: context };
  await chrome.storage.local.set({ [STORAGE.contexts]: contexts });
}

async function removeTabContext(tabId) {
  const stored = await chrome.storage.local.get(STORAGE.contexts);
  const contexts = { ...(stored[STORAGE.contexts] ?? {}) };
  delete contexts[String(tabId)];
  await chrome.storage.local.set({ [STORAGE.contexts]: contexts });
}

async function appendLog(message) {
  const stored = await chrome.storage.local.get(STORAGE.logs);
  const logs = stored[STORAGE.logs] ?? [];
  logs.unshift({ at: new Date().toISOString(), message: String(message).slice(0, 160) });
  await chrome.storage.local.set({ [STORAGE.logs]: logs.slice(0, 200) });
}

async function ensureAlarms() {
  const tracking = await chrome.alarms.get("finpilot-track");
  if (!tracking) await chrome.alarms.create("finpilot-track", { periodInMinutes: 5 });
  const scanner = await chrome.alarms.get("finpilot-market-scan");
  if (!scanner) await chrome.alarms.create("finpilot-market-scan", { periodInMinutes: 15 });
}

async function cachedMarketBundle(symbol) {
  const key = String(symbol).toUpperCase();
  const cached = bundleCache.get(key);
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.bundle;
  const bundle = await fetchMarketBundle(key);
  bundleCache.set(key, { at: Date.now(), bundle });
  if (bundleCache.size > 350) {
    const oldest = [...bundleCache.entries()].sort(([, left], [, right]) => left.at - right.at).slice(0, 80);
    for (const [oldKey] of oldest) bundleCache.delete(oldKey);
  }
  return bundle;
}

async function dynamicCryptoUniverse() {
  const stored = await chrome.storage.local.get(STORAGE.cryptoUniverse);
  const cached = stored[STORAGE.cryptoUniverse];
  if (cached?.symbols?.length && Date.now() - Date.parse(cached.updatedAt) < 15 * 60_000) return cached.symbols;
  try {
    const symbols = await discoverBinanceSpotSymbols({ limit: 1_000 });
    await chrome.storage.local.set({
      [STORAGE.cryptoUniverse]: { symbols, updatedAt: new Date().toISOString() }
    });
    return symbols;
  } catch {
    return cached?.symbols ?? [];
  }
}

async function dynamicBistUniverse() {
  const stored = await chrome.storage.local.get(STORAGE.bistUniverse);
  const cached = stored[STORAGE.bistUniverse];
  if (cached?.symbols?.length >= 400 && Date.now() - Date.parse(cached.updatedAt) < 24 * 60 * 60_000) {
    return cached.symbols;
  }
  try {
    const symbols = await discoverKapBistSymbols();
    await chrome.storage.local.set({
      [STORAGE.bistUniverse]: { symbols, updatedAt: new Date().toISOString() }
    });
    return symbols;
  } catch {
    return cached?.symbols ?? [];
  }
}

async function dynamicUsUniverse() {
  const stored = await chrome.storage.local.get(STORAGE.usUniverse);
  const cached = stored[STORAGE.usUniverse];
  if (cached?.symbols?.length >= 30 && Date.now() - Date.parse(cached.updatedAt) < 30 * 60_000) {
    return cached.symbols;
  }
  try {
    const symbols = await discoverYahooUsSymbols({ limit: 700 });
    await chrome.storage.local.set({
      [STORAGE.usUniverse]: { symbols, updatedAt: new Date().toISOString() }
    });
    return symbols;
  } catch {
    return cached?.symbols ?? [];
  }
}

async function dynamicMarketSources() {
  const [bist, us, crypto] = await Promise.all([
    dynamicBistUniverse(),
    dynamicUsUniverse(),
    dynamicCryptoUniverse()
  ]);
  return { BIST: bist, US: us, CRYPTO: crypto };
}

function sortResults(results) {
  return [...results].sort((left, right) => {
    if (Number(right.verdictCode) !== Number(left.verdictCode)) return Number(right.verdictCode) - Number(left.verdictCode);
    if (Number(right.opportunityScore) !== Number(left.opportunityScore)) return (Number(right.opportunityScore) || 0) - (Number(left.opportunityScore) || 0);
    if (Number(right.technicalScore) !== Number(left.technicalScore)) return (Number(right.technicalScore) || 0) - (Number(left.technicalScore) || 0);
    return (Number(right.dataHealth) || 0) - (Number(left.dataHealth) || 0);
  });
}

function normalizeCategory(value) {
  const category = String(value ?? "ALL").toUpperCase();
  return ["ALL", "BIST", "US", "CRYPTO", "FOREX", "MACRO"].includes(category) ? category : "ALL";
}

function normalizeContext(value) {
  const parsed = parseTradingViewSymbol(value?.symbol);
  if (!parsed) return null;
  return {
    symbol: parsed.full,
    exchange: parsed.exchange,
    ticker: parsed.ticker,
    market: parsed.market,
    timeframe: String(value?.timeframe ?? "").replace(/[^0-9A-Z]/giu, "").slice(0, 8),
    source: String(value?.source ?? "TradingView grafiği").replace(/[\u0000-\u001F\u007F]/gu, "").slice(0, 48),
    confidence: Math.min(100, Math.max(0, Number(value?.confidence) || 0)),
    votes: Math.min(20, Math.max(0, Number(value?.votes) || 0)),
    ambiguous: Boolean(value?.ambiguous),
    alternatives: sanitizeSymbolList(value?.alternatives, 2),
    detectedAt: Number.isFinite(Date.parse(value?.detectedAt)) ? new Date(value.detectedAt).toISOString() : new Date().toISOString()
  };
}

function failureResult(symbol, error) {
  const parsed = parseTradingViewSymbol(symbol);
  return {
    id: `${parsed?.full ?? "UNKNOWN"}-${Date.now()}`,
    symbol: parsed?.full ?? "UNKNOWN",
    ticker: parsed?.ticker ?? "",
    exchange: parsed?.exchange ?? "",
    market: parsed?.market ?? "OTHER",
    provider: "",
    sourceLabel: "Kaynak başarısız",
    analyzedAt: new Date().toISOString(),
    barTime: null,
    verdict: VERDICTS.NO_DATA,
    decisionLabel: VERDICTS.NO_DATA,
    verdictCode: -1,
    horizon: HORIZONS.INTRADAY,
    horizonLabel: "15 DK",
    primaryHorizon: HORIZONS.INTRADAY,
    horizons: null,
    tradeSide: SIDES.NONE,
    actionable: false,
    signalState: "VERİ BEKLİYOR",
    technicalScore: 0,
    sideScores: { long: 0, short: 0 },
    opportunityScore: 0,
    dataHealth: 0,
    setup: "Kurulum yok",
    directions: { intraday: "BELİRSİZ", oneDay: "BELİRSİZ", oneWeek: "BELİRSİZ" },
    directionScores: { intraday: 0, oneDay: 0, oneWeek: 0 },
    expectedRanges: null,
    plan: null,
    trigger: null,
    execution: null,
    reasons: [],
    failed: [],
    blockers: [String(error?.message || "Piyasa verisi alınamadı").slice(0, 180)],
    factors: [],
    metrics: {},
    freeMode: true,
    disclaimer: "Veri alınamadığı için olumlu işlem kararı üretilmedi."
  };
}

function runAsync(sendResponse, task) {
  void task()
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: String(error?.message || error).slice(0, 240) }));
}

function assertTradingViewSender(sender) {
  if (!isTradingViewUrl(sender?.url) && !isTradingViewUrl(sender?.tab?.url)) {
    throw new Error("Mesaj TradingView sekmesinden gelmedi");
  }
}

function isTradingViewUrl(value) {
  try {
    const url = new URL(String(value ?? ""));
    return url.protocol === "https:" && (url.hostname === "tradingview.com" || url.hostname.endsWith(".tradingview.com"));
  } catch {
    return false;
  }
}

function price(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString("tr-TR", { maximumFractionDigits: 6 }) : "—";
}

function unique(values) {
  return [...new Set(values)];
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
