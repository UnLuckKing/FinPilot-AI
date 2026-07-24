const KAP_ENDPOINTS = Object.freeze([
  "https://www.kap.org.tr/tr/bist-sirketler",
  "https://kap.org.tr/tr/bist-sirketler"
]);

const YAHOO_SCREENS = Object.freeze([
  "most_actives",
  "day_gainers",
  "day_losers",
  "small_cap_gainers",
  "small_cap_losers",
  "growth_technology_stocks",
  "undervalued_growth_stocks",
  "aggressive_small_caps",
  "most_shorted_stocks"
]);

export async function discoverKapBistSymbols(options = {}) {
  const fetchFn = options.fetchFn ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 25_000;
  let lastError;
  for (const endpoint of KAP_ENDPOINTS) {
    try {
      const html = await fetchText(endpoint, fetchFn, timeoutMs);
      const symbols = parseKapBistSymbols(html);
      if (symbols.length < 400) throw new Error("KAP sembol listesi beklenenden kısa");
      return symbols;
    } catch (error) {
      lastError = error;
    }
  }
  throw discoveryError("KAP BIST şirket listesi alınamadı", lastError);
}

export function parseKapBistSymbols(html) {
  const source = String(html ?? "");
  const codes = [];
  const patterns = [
    /\\"stockCode\\":\\"([^"\\]+)\\"/gu,
    /"stockCode"\s*:\s*"([^"]+)"/gu
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      for (const rawCode of String(match[1] ?? "").split(/[\s,;/]+/u)) {
        const code = rawCode.toUpperCase().replace(/[^A-Z0-9]/gu, "");
        if (/^[A-Z0-9]{2,12}$/u.test(code)) codes.push(`BIST:${code}`);
      }
    }
    if (codes.length > 0) break;
  }
  return unique(codes);
}

export async function discoverYahooUsSymbols(options = {}) {
  const fetchFn = options.fetchFn ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const count = Math.min(250, Math.max(25, Number(options.countPerScreen) || 250));
  const screens = options.screens ?? YAHOO_SCREENS;
  const settled = await Promise.allSettled(screens.map(async (screen) => {
    const url = new URL("https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved");
    url.searchParams.set("count", String(count));
    url.searchParams.set("scrIds", screen);
    const payload = await fetchJson(url.toString(), fetchFn, timeoutMs);
    return parseYahooScreenerSymbols(payload);
  }));
  const symbols = unique(settled.flatMap((item) => item.status === "fulfilled" ? item.value : []));
  if (symbols.length < 30) {
    const reason = settled.find((item) => item.status === "rejected")?.reason;
    throw discoveryError("ABD fırsat evreni alınamadı", reason);
  }
  return symbols.slice(0, options.limit ?? 700);
}

export function parseYahooScreenerSymbols(payload) {
  const quotes = payload?.finance?.result?.[0]?.quotes;
  if (!Array.isArray(quotes)) throw new Error("Yahoo tarayıcı yanıtı geçersiz");
  return unique(quotes.flatMap((quote) => {
    if (!["EQUITY", "ETF"].includes(String(quote?.quoteType ?? "").toUpperCase())) return [];
    const ticker = normalizeYahooTicker(quote?.symbol);
    if (!ticker) return [];
    return [`${tradingViewExchange(quote)}:${ticker}`];
  }));
}

function tradingViewExchange(quote) {
  const code = String(quote?.exchange ?? "").toUpperCase();
  const name = String(quote?.fullExchangeName ?? "").toUpperCase();
  if (["NMS", "NGM", "NCM"].includes(code) || name.includes("NASDAQ")) return "NASDAQ";
  if (code === "NYQ" || name === "NYSE") return "NYSE";
  if (["ASE", "PCX"].includes(code) || name.includes("AMERICAN") || name.includes("ARCA")) return "AMEX";
  return "NASDAQ";
}

function normalizeYahooTicker(value) {
  const ticker = String(value ?? "").toUpperCase().replace(/-/gu, ".");
  return /^[A-Z0-9][A-Z0-9.]{0,14}$/u.test(ticker) ? ticker : "";
}

async function fetchText(url, fetchFn, timeoutMs) {
  const response = await timedFetch(url, fetchFn, timeoutMs, {
    headers: { Accept: "text/html,application/xhtml+xml" }
  });
  return response.text();
}

async function fetchJson(url, fetchFn, timeoutMs) {
  const response = await timedFetch(url, fetchFn, timeoutMs, {
    headers: { Accept: "application/json" }
  });
  return response.json();
}

async function timedFetch(url, fetchFn, timeoutMs, init) {
  if (typeof fetchFn !== "function") throw new Error("fetch kullanılamıyor");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchFn(url, {
      method: "GET",
      cache: "no-store",
      credentials: "omit",
      redirect: "follow",
      signal: controller.signal,
      ...init
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

function discoveryError(message, cause) {
  return new Error(`${message}${cause?.message ? `: ${cause.message}` : ""}`);
}

function unique(values) {
  return [...new Set(values)];
}

export { KAP_ENDPOINTS, YAHOO_SCREENS };
