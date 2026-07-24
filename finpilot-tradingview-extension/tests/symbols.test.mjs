import test from "node:test";
import assert from "node:assert/strict";
import { parseTradingViewSymbol, resolveProviderSymbol, sanitizeSymbolList } from "../lib/symbols.js";

test("TradingView symbols are normalized", () => {
  assert.deepEqual(parseTradingViewSymbol("bist:thyao"), {
    full: "BIST:THYAO",
    exchange: "BIST",
    ticker: "THYAO",
    market: "STOCK"
  });
});

test("BIST, Binance, forex and futures symbols map safely", () => {
  assert.equal(resolveProviderSymbol("BIST:THYAO").symbol, "THYAO.IS");
  assert.equal(resolveProviderSymbol("BINANCE:BTCUSDT").provider, "BINANCE");
  assert.equal(resolveProviderSymbol("FX_IDC:EURUSD").symbol, "EURUSD=X");
  assert.equal(resolveProviderSymbol("COMEX:GC1!").symbol, "GC=F");
});

test("unknown futures and options fail closed", () => {
  assert.equal(resolveProviderSymbol("CME:UNKNOWN1!").ok, false);
  assert.equal(resolveProviderSymbol("OPRA:AAPL260117C00200000").ok, false);
});

test("watchlist values are deduplicated and bounded", () => {
  const values = Array.from({ length: 60 }, (_, index) => `NASDAQ:T${index}`);
  const result = sanitizeSymbolList(["BIST:THYAO", "bist:thyao", ...values], 30);
  assert.equal(result.length, 30);
  assert.equal(result[0], "BIST:THYAO");
});
