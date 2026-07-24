import test from "node:test";
import assert from "node:assert/strict";
import { getMarketUniverse, marketCategoryCounts } from "../lib/universe.js";

test("general radar covers every requested market category", () => {
  const counts = marketCategoryCounts();
  assert.ok(counts.BIST >= 80);
  assert.ok(counts.US >= 80);
  assert.ok(counts.CRYPTO >= 40);
  assert.ok(counts.FOREX >= 20);
  assert.ok(counts.MACRO >= 20);
  assert.equal(getMarketUniverse("BIST").includes("BIST:BIMAS"), true);
});

test("all-markets universe is deduplicated and accepts dynamic crypto", () => {
  const universe = getMarketUniverse("ALL", ["BINANCE:BTCUSDT", "BINANCE:NEWUSDT"]);
  assert.equal(universe.length, new Set(universe).size);
  assert.ok(universe.includes("BINANCE:NEWUSDT"));
  assert.ok(universe.some((symbol) => symbol.startsWith("FX_IDC:")));
  assert.ok(universe.some((symbol) => symbol.startsWith("COMEX:")));
});

test("automatic universe accepts dynamic KAP, US and full crypto discoveries", () => {
  const dynamic = {
    BIST: ["BIST:BIMAS", "BIST:YENI"],
    US: ["NASDAQ:NEWAI"],
    CRYPTO: ["BINANCE:BTCUSDT", "BINANCE:NEWUSDT"]
  };
  const universe = getMarketUniverse("ALL", dynamic);
  const counts = marketCategoryCounts(dynamic);
  assert.ok(universe.includes("BIST:YENI"));
  assert.ok(universe.includes("NASDAQ:NEWAI"));
  assert.ok(universe.includes("BINANCE:NEWUSDT"));
  assert.equal(counts.ALL, universe.length);
  assert.ok(counts.US >= 100);
});
