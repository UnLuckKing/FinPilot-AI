import test from "node:test";
import assert from "node:assert/strict";
import {
  discoverBinanceSpotSymbols,
  fetchBinanceBundle,
  fetchDailyFrame,
  fetchYahooBundle,
  parseBinanceKlines,
  parseYahooChart
} from "../lib/providers.js";

test("Binance kline arrays are parsed", () => {
  const bars = parseBinanceKlines([
    [1_000, "10", "12", "9", "11", "250"],
    [2_000, "11", "13", "10", "12", "300"]
  ]);
  assert.equal(bars.length, 2);
  assert.equal(bars[1].close, 12);
  assert.equal(bars[1].volume, 300);
});

test("Yahoo chart response is parsed and null rows are ignored", () => {
  const result = parseYahooChart({
    chart: {
      result: [{
        timestamp: [1, 2],
        meta: { currency: "TRY" },
        indicators: {
          quote: [{
            open: [10, null],
            high: [12, null],
            low: [9, null],
            close: [11, null],
            volume: [100, null]
          }]
        }
      }],
      error: null
    }
  });
  assert.equal(result.bars.length, 1);
  assert.equal(result.bars[0].time, 1_000);
  assert.equal(result.meta.currency, "TRY");
});

test("provider errors do not silently become empty arrays", () => {
  assert.throws(() => parseYahooChart({ chart: { result: null, error: { description: "Not found" } } }), /Not found/u);
  assert.throws(() => parseBinanceKlines({}), /geçersiz/u);
});

test("Binance universe discovery ranks liquid live USDT spot pairs", async () => {
  const fetchFn = async (url) => ({
    ok: true,
    async json() {
      if (url.includes("exchangeInfo")) {
        return {
          symbols: [
            { symbol: "BTCUSDT", status: "TRADING", quoteAsset: "USDT", isSpotTradingAllowed: true },
            { symbol: "ETHUSDT", status: "TRADING", quoteAsset: "USDT", isSpotTradingAllowed: true },
            { symbol: "ABCUPUSDT", status: "TRADING", quoteAsset: "USDT", isSpotTradingAllowed: true },
            { symbol: "OLDUSDT", status: "BREAK", quoteAsset: "USDT", isSpotTradingAllowed: true }
          ]
        };
      }
      return [
        { symbol: "ETHUSDT", quoteVolume: "500" },
        { symbol: "BTCUSDT", quoteVolume: "1000" },
        { symbol: "ABCUPUSDT", quoteVolume: "2000" },
        { symbol: "OLDUSDT", quoteVolume: "3000" }
      ];
    }
  });
  const symbols = await discoverBinanceSpotSymbols({ fetchFn, limit: 10 });
  assert.deepEqual(symbols, ["BINANCE:BTCUSDT", "BINANCE:ETHUSDT"]);
});

test("optimized Binance bundle derives 1h and 4h frames from 15m data", async () => {
  const fetchFn = async (url) => {
    const parsed = new URL(url);
    const interval = parsed.searchParams.get("interval");
    const count = interval === "15m" ? 1000 : 300;
    const step = interval === "15m" ? 15 * 60_000 : 24 * 60 * 60_000;
    return {
      ok: true,
      async json() {
        return Array.from({ length: count }, (_, index) => [
          1_700_000_000_000 + index * step,
          "100", "102", "99", "101", "1000"
        ]);
      }
    };
  };
  const bundle = await fetchBinanceBundle({
    symbol: "BTCUSDT",
    parsed: { full: "BINANCE:BTCUSDT", market: "CRYPTO", exchange: "BINANCE", ticker: "BTCUSDT" }
  }, { fetchFn });
  assert.equal(bundle.frames.fifteen.length, 1000);
  assert.ok(bundle.frames.hour.length >= 240);
  assert.ok(bundle.frames.fourHour.length >= 60);
  assert.equal(bundle.frames.day.length, 300);
});

test("optimized general-market bundle uses two requests and derives intraday frames", async () => {
  let calls = 0;
  const fetchFn = async (url) => {
    calls += 1;
    const parsed = new URL(url);
    const interval = parsed.searchParams.get("interval");
    const isIntraday = interval === "15m";
    const count = isIntraday ? 1000 : 180;
    const step = isIntraday ? 15 * 60 : 24 * 60 * 60;
    return {
      ok: true,
      async json() {
        return {
          chart: {
            result: [{
              timestamp: Array.from({ length: count }, (_, index) => 1_700_000_000 + index * step),
              meta: {
                currency: "TRY",
                exchangeName: "IST",
                regularMarketTime: 1_700_000_000,
                currentTradingPeriod: { regular: { start: 1, end: 2 } }
              },
              indicators: {
                quote: [{
                  open: Array(count).fill(100),
                  high: Array(count).fill(102),
                  low: Array(count).fill(99),
                  close: Array(count).fill(101),
                  volume: Array(count).fill(1000)
                }]
              }
            }],
            error: null
          }
        };
      }
    };
  };
  const bundle = await fetchYahooBundle({
    symbol: "BIMAS.IS",
    parsed: { full: "BIST:BIMAS", market: "STOCK", exchange: "BIST", ticker: "BIMAS" }
  }, { fetchFn });
  assert.equal(calls, 2);
  assert.ok(bundle.frames.hour.length >= 240);
  assert.ok(bundle.frames.fourHour.length >= 60);
  assert.equal(bundle.frames.day.length, 180);
});

test("fast daily frame uses one request for first-stage screening", async () => {
  let calls = 0;
  const fetchFn = async () => {
    calls += 1;
    const count = 120;
    return {
      ok: true,
      async json() {
        return {
          chart: {
            result: [{
              timestamp: Array.from({ length: count }, (_, index) => 1_700_000_000 + index * 86_400),
              meta: { currency: "TRY" },
              indicators: {
                quote: [{
                  open: Array(count).fill(100),
                  high: Array(count).fill(102),
                  low: Array(count).fill(99),
                  close: Array(count).fill(101),
                  volume: Array(count).fill(1_000_000)
                }]
              }
            }],
            error: null
          }
        };
      }
    };
  };
  const frame = await fetchDailyFrame("BIST:BIMAS", { fetchFn });
  assert.equal(calls, 1);
  assert.equal(frame.requestedSymbol, "BIST:BIMAS");
  assert.equal(frame.bars.length, 120);
});
