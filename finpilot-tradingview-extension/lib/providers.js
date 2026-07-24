import { normalizeBars, resampleBars } from "./indicators.js";
import { resolveProviderSymbol } from "./symbols.js";

const BINANCE_INTERVALS = Object.freeze({
  fifteen: { interval: "15m", intervalMs: 15 * 60_000, limit: 1000 },
  day: { interval: "1d", intervalMs: 24 * 60 * 60_000, limit: 300 }
});

const YAHOO_INTERVALS = Object.freeze({
  fifteen: { interval: "15m", intervalMs: 15 * 60_000, range: "60d" },
  day: { interval: "1d", intervalMs: 24 * 60 * 60_000, range: "3y" }
});

export async function fetchMarketBundle(tradingViewSymbol, options = {}) {
  const resolved = resolveProviderSymbol(tradingViewSymbol);
  if (!resolved.ok) {
    const error = new Error(resolved.reason || "Sembol eşleştirilemedi");
    error.code = "UNSUPPORTED_SYMBOL";
    throw error;
  }
  if (resolved.provider === "BINANCE") return fetchBinanceBundle(resolved, options);
  return fetchYahooBundle(resolved, options);
}

export async function fetchDailyFrame(tradingViewSymbol, options = {}) {
  const resolved = resolveProviderSymbol(tradingViewSymbol);
  if (!resolved.ok) throw new Error(resolved.reason || "Sembol eşleştirilemedi");
  if (resolved.provider === "BINANCE") return fetchBinanceDailyFrame(resolved, options);
  return fetchYahooDailyFrame(resolved, options);
}

export async function discoverBinanceSpotSymbols(options = {}) {
  const fetchFn = options.fetchFn ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const endpoints = ["https://data-api.binance.vision", "https://api.binance.com"];
  let lastError;
  for (const endpoint of endpoints) {
    try {
      const [exchangeInfo, tickers] = await Promise.all([
        fetchJson(`${endpoint}/api/v3/exchangeInfo`, fetchFn, timeoutMs),
        fetchJson(`${endpoint}/api/v3/ticker/24hr`, fetchFn, timeoutMs)
      ]);
      const tradable = new Set((exchangeInfo?.symbols ?? [])
        .filter((item) =>
          item?.status === "TRADING" &&
          item?.isSpotTradingAllowed !== false &&
          item?.quoteAsset === "USDT" &&
          !/(UP|DOWN|BULL|BEAR)USDT$/u.test(item.symbol)
        )
        .map((item) => item.symbol));
      return (Array.isArray(tickers) ? tickers : [])
        .filter((item) => tradable.has(item?.symbol) && Number(item?.quoteVolume) > 0)
        .sort((left, right) => Number(right.quoteVolume) - Number(left.quoteVolume))
        .slice(0, options.limit ?? 80)
        .map((item) => `BINANCE:${item.symbol}`);
    } catch (error) {
      lastError = error;
    }
  }
  throw providerError("Binance işlem çifti listesi alınamadı", lastError);
}

async function fetchBinanceDailyFrame(resolved, options = {}) {
  const fetchFn = options.fetchFn ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const endpoints = ["https://data-api.binance.vision", "https://api.binance.com"];
  let lastError;
  for (const endpoint of endpoints) {
    try {
      const url = new URL("/api/v3/klines", endpoint);
      url.searchParams.set("symbol", resolved.symbol);
      url.searchParams.set("interval", "1d");
      url.searchParams.set("limit", "180");
      const bars = parseBinanceKlines(await fetchJson(url.toString(), fetchFn, timeoutMs));
      if (bars.length < 60) throw new Error("Günlük geçmiş yetersiz");
      return dailyFrameResult(resolved, "BINANCE", bars);
    } catch (error) {
      lastError = error;
    }
  }
  throw providerError("Binance günlük veri alınamadı", lastError);
}

async function fetchYahooDailyFrame(resolved, options = {}) {
  const fetchFn = options.fetchFn ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 12_000;
  const hosts = ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"];
  let lastError;
  for (const host of hosts) {
    try {
      const path = `/v8/finance/chart/${encodeURIComponent(resolved.symbol)}`;
      const url = new URL(path, host);
      url.searchParams.set("interval", "1d");
      url.searchParams.set("range", "1y");
      url.searchParams.set("includePrePost", "false");
      url.searchParams.set("events", "div,splits");
      const parsed = parseYahooChart(await fetchJson(url.toString(), fetchFn, timeoutMs));
      if (parsed.bars.length < 60) throw new Error("Günlük geçmiş yetersiz");
      return dailyFrameResult(resolved, "YAHOO", parsed.bars, parsed.meta);
    } catch (error) {
      lastError = error;
    }
  }
  throw providerError("Genel günlük veri alınamadı", lastError);
}

export async function fetchBinanceBundle(resolved, options = {}) {
  const fetchFn = options.fetchFn ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const endpoints = [
    "https://data-api.binance.vision",
    "https://api.binance.com"
  ];
  let lastError;

  for (const endpoint of endpoints) {
    try {
      const entries = await Promise.all(Object.entries(BINANCE_INTERVALS).map(async ([name, config]) => {
        const url = new URL("/api/v3/klines", endpoint);
        url.searchParams.set("symbol", resolved.symbol);
        url.searchParams.set("interval", config.interval);
        url.searchParams.set("limit", String(config.limit));
        const payload = await fetchJson(url.toString(), fetchFn, timeoutMs);
        return [name, parseBinanceKlines(payload)];
      }));
      const raw = Object.fromEntries(entries);
      const frames = {
        fifteen: raw.fifteen,
        hour: resampleBars(raw.fifteen, 60 * 60_000),
        fourHour: resampleBars(raw.fifteen, 4 * 60 * 60_000),
        day: raw.day
      };
      assertFrames(frames);
      return {
        requestedSymbol: resolved.parsed.full,
        provider: "BINANCE",
        providerSymbol: resolved.symbol,
        market: resolved.parsed.market,
        exchange: resolved.parsed.exchange,
        ticker: resolved.parsed.ticker,
        fetchedAt: Date.now(),
        intervals: {
          fifteen: BINANCE_INTERVALS.fifteen.intervalMs,
          hour: 60 * 60_000,
          fourHour: 4 * 60 * 60_000,
          day: BINANCE_INTERVALS.day.intervalMs
        },
        frames,
        meta: {
          currency: quoteAsset(resolved.symbol),
          exchangeName: "Binance Spot",
          marketOpen: true,
          regularMarketTime: frames.fifteen.at(-1)?.time ?? 0
        }
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw providerError("Binance piyasa verisi alınamadı", lastError);
}

export async function fetchYahooBundle(resolved, options = {}) {
  const fetchFn = options.fetchFn ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 12_000;
  const hosts = ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"];
  let lastError;

  for (const host of hosts) {
    try {
      const responses = await Promise.all(Object.entries(YAHOO_INTERVALS).map(async ([name, config]) => {
        const path = `/v8/finance/chart/${encodeURIComponent(resolved.symbol)}`;
        const url = new URL(path, host);
        url.searchParams.set("interval", config.interval);
        url.searchParams.set("range", config.range);
        url.searchParams.set("includePrePost", "false");
        url.searchParams.set("events", "div,splits");
        const payload = await fetchJson(url.toString(), fetchFn, timeoutMs);
        return [name, parseYahooChart(payload)];
      }));

      const parsed = Object.fromEntries(responses);
      const frames = {
        fifteen: parsed.fifteen.bars,
        hour: resampleBars(parsed.fifteen.bars, 60 * 60_000),
        fourHour: resampleBars(parsed.fifteen.bars, 4 * 60 * 60_000),
        day: parsed.day.bars
      };
      assertFrames(frames);
      const meta = { ...parsed.fifteen.meta, ...parsed.day.meta };
      return {
        requestedSymbol: resolved.parsed.full,
        provider: "YAHOO",
        providerSymbol: resolved.symbol,
        market: resolved.parsed.market,
        exchange: resolved.parsed.exchange,
        ticker: resolved.parsed.ticker,
        fetchedAt: Date.now(),
        intervals: {
          fifteen: YAHOO_INTERVALS.fifteen.intervalMs,
          hour: 60 * 60_000,
          fourHour: 4 * 60 * 60_000,
          day: YAHOO_INTERVALS.day.intervalMs
        },
        frames,
        meta: {
          currency: String(meta.currency ?? ""),
          exchangeName: String(meta.exchangeName ?? meta.fullExchangeName ?? resolved.parsed.exchange),
          marketOpen: isMarketOpen(meta),
          regularMarketTime: Number(meta.regularMarketTime ?? 0) * 1_000,
          timezone: String(meta.exchangeTimezoneName ?? "")
        }
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw providerError("Genel piyasa verisi alınamadı", lastError);
}

export function parseBinanceKlines(payload) {
  if (!Array.isArray(payload)) throw new Error("Binance yanıt biçimi geçersiz");
  return normalizeBars(payload.map((item) => ({
    time: Number(item?.[0]),
    open: Number(item?.[1]),
    high: Number(item?.[2]),
    low: Number(item?.[3]),
    close: Number(item?.[4]),
    volume: Number(item?.[5])
  })));
}

export function parseYahooChart(payload) {
  const result = payload?.chart?.result?.[0];
  if (!result || !Array.isArray(result.timestamp)) {
    const description = payload?.chart?.error?.description;
    throw new Error(description || "Piyasa veri yanıtı boş");
  }
  const quote = result.indicators?.quote?.[0] ?? {};
  const bars = result.timestamp.map((timestamp, index) => ({
    time: Number(timestamp) * 1_000,
    open: quote.open?.[index],
    high: quote.high?.[index],
    low: quote.low?.[index],
    close: quote.close?.[index],
    volume: quote.volume?.[index] ?? 0
  }));
  return { bars: normalizeBars(bars), meta: result.meta ?? {} };
}

async function fetchJson(url, fetchFn, timeoutMs) {
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
      headers: { Accept: "application/json" }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function assertFrames(frames) {
  const minimums = { fifteen: 80, hour: 80, fourHour: 60, day: 80 };
  const missing = Object.entries(minimums)
    .filter(([name, minimum]) => !Array.isArray(frames[name]) || frames[name].length < minimum)
    .map(([name]) => name);
  if (missing.length > 0) throw new Error(`Yetersiz mum geçmişi: ${missing.join(", ")}`);
}

function isMarketOpen(meta) {
  const nowSeconds = Date.now() / 1_000;
  const regular = meta?.currentTradingPeriod?.regular;
  if (Number(regular?.start) > 0 && Number(regular?.end) > 0) {
    return nowSeconds >= Number(regular.start) && nowSeconds <= Number(regular.end);
  }
  return String(meta?.marketState ?? "").toUpperCase() === "REGULAR";
}

function quoteAsset(symbol) {
  for (const quote of ["USDT", "USDC", "FDUSD", "BTC", "ETH", "EUR", "TRY"]) {
    if (symbol.endsWith(quote)) return quote;
  }
  return "";
}

function dailyFrameResult(resolved, provider, bars, meta = {}) {
  return {
    requestedSymbol: resolved.parsed.full,
    provider,
    providerSymbol: resolved.symbol,
    market: resolved.parsed.market,
    exchange: resolved.parsed.exchange,
    ticker: resolved.parsed.ticker,
    fetchedAt: Date.now(),
    intervalMs: 24 * 60 * 60_000,
    bars,
    meta
  };
}

function providerError(message, cause) {
  const error = new Error(`${message}${cause?.message ? `: ${cause.message}` : ""}`);
  error.code = "PROVIDER_ERROR";
  return error;
}
