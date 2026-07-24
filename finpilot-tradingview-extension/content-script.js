(() => {
  const INSTANCE_KEY = "__finpilotTradingViewDetectorV21";
  const existing = globalThis[INSTANCE_KEY];
  if (existing?.announceContext) {
    existing.announceContext(true);
    return;
  }

  let lastSignature = "";
  let debounceTimer;

  function detectContext() {
    const detection = detectSymbolDetails();
    if (!detection?.symbol) return null;
    return {
      symbol: detection.symbol,
      timeframe: detectTimeframe(),
      source: detection.source,
      confidence: detection.confidence,
      votes: detection.votes,
      ambiguous: detection.ambiguous,
      alternatives: detection.alternatives,
      pageTitle: document.title.slice(0, 120),
      detectedAt: new Date().toISOString()
    };
  }

  function detectSymbolDetails() {
    const url = new URL(location.href);
    const urlSymbol = url.searchParams.get("symbol");
    const chartSelectors = [
      "[data-name='pane-legend'] [data-symbol-full]",
      "[data-name='legend-source-item'] [data-symbol-full]",
      "[data-name='pane-legend'] [data-symbol]",
      "[data-name='legend-source-item'] [data-symbol]",
      "[data-name='series-title'] [data-symbol-full]",
      "[data-name='series-title'] [data-symbol]",
      "[data-name='legend-source-title']",
      "[data-name='series-title']",
      "[data-name='pane-legend'] [class*='title']",
      "[data-name='pane-legend']"
    ];
    const toolbarSelectors = [
      "#header-toolbar-symbol-search",
      "[data-name='symbol-search-button']",
      "button[aria-label*='symbol' i]",
      "button[aria-label*='sembol' i]"
    ];
    return globalThis.FinPilotDetection.chooseSymbolDetails({
      urlSymbol,
      chartValues: valuesFromSelectors(chartSelectors),
      toolbarValues: valuesFromSelectors(toolbarSelectors),
      title: document.title
    });
  }

  function detectTimeframe() {
    const selectors = [
      "[data-name='date-ranges-tabs'] [aria-pressed='true']",
      "#header-toolbar-intervals button[aria-pressed='true']",
      "[data-name='interval-dialog-button']",
      "button[data-value][aria-checked='true']"
    ];
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      const text = element?.getAttribute("data-value") || element?.textContent?.trim();
      if (text && text.length <= 12) return text;
    }
    return "";
  }

  function normalizeSymbol(value) {
    return globalThis.FinPilotDetection.normalizeFullSymbol(value);
  }

  function announceContext(force = false) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const context = detectContext();
      const signature = context
        ? `${context.symbol}|${context.timeframe}|${context.source}|${context.confidence}`
        : "";
      if (!context || (!force && signature === lastSignature)) return;
      lastSignature = signature;
      chrome.runtime.sendMessage({ action: "TV_CONTEXT", context }).catch(() => {});
    }, force ? 30 : 280);
  }

  function extractWatchlist() {
    const values = new Set();
    const elements = document.querySelectorAll([
      "[data-symbol-full]",
      "[data-symbol]",
      "a[href*='symbol=']",
      "[data-name='watchlist-item']"
    ].join(","));

    for (const element of elements) {
      const candidates = [
        element.getAttribute("data-symbol-full"),
        element.getAttribute("data-symbol"),
        symbolFromHref(element.getAttribute("href")),
        element.getAttribute("aria-label"),
        element.textContent
      ];
      for (const candidate of candidates) {
        const normalized = normalizeSymbol(candidate);
        if (normalized) values.add(normalized);
        if (values.size >= 60) break;
      }
      if (values.size >= 60) break;
    }
    const active = detectSymbolDetails()?.symbol;
    if (active) values.add(active);
    return [...values];
  }

  function symbolFromHref(href) {
    if (!href) return "";
    try {
      const url = new URL(href, location.origin);
      return url.searchParams.get("symbol") ?? "";
    } catch {
      return "";
    }
  }

  function valuesFromSelectors(selectors) {
    const result = [];
    for (const selector of selectors) {
      for (const element of document.querySelectorAll(selector)) {
        result.push(
          element.getAttribute("data-symbol-full"),
          element.getAttribute("data-symbol"),
          element.getAttribute("aria-label"),
          element.getAttribute("title"),
          element.textContent?.trim()
        );
      }
    }
    return result.filter(Boolean);
  }

  function installRouteHooks() {
    for (const method of ["pushState", "replaceState"]) {
      const original = history[method];
      if (typeof original !== "function" || original.__finpilotWrapped) continue;
      const wrapped = function (...args) {
        const result = original.apply(this, args);
        announceContext(true);
        return result;
      };
      Object.defineProperty(wrapped, "__finpilotWrapped", { value: true });
      history[method] = wrapped;
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.action === "GET_TV_CONTEXT") {
      sendResponse({ context: detectContext(), detectorVersion: "2.1.0" });
      return false;
    }
    if (message?.action === "EXTRACT_WATCHLIST") {
      sendResponse({ symbols: extractWatchlist() });
      return false;
    }
    if (message?.action === "FINPILOT_PING") {
      sendResponse({ ok: true, detectorVersion: "2.1.0" });
      return false;
    }
    return false;
  });

  const observer = new MutationObserver(() => announceContext(false));
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["data-symbol", "data-symbol-full", "aria-label", "title"]
  });
  installRouteHooks();
  window.addEventListener("popstate", () => announceContext(true));
  window.addEventListener("hashchange", () => announceContext(true));
  window.addEventListener("pageshow", () => announceContext(true));
  window.addEventListener("focus", () => announceContext(true));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") announceContext(true);
  });
  setInterval(() => announceContext(false), 1_500);

  globalThis[INSTANCE_KEY] = Object.freeze({ announceContext, detectContext });
  announceContext(true);
})();
