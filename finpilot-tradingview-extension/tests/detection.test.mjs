import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../lib/detection-global.js", import.meta.url), "utf8");
const context = {};
context.globalThis = context;
vm.runInNewContext(source, context);
const detection = context.FinPilotDetection;

test("SPA title change overrides a stale HEDEF URL with BIMAS", () => {
  const symbol = detection.chooseSymbol({
    urlSymbol: "BIST:HEDEF",
    chartValues: ["BİM BİRLEŞİK MAĞAZALAR A.Ş."],
    toolbarValues: ["BIMAS"],
    title: "BIMAS 532,50 ▲ 1,2% — TradingView"
  });
  assert.equal(symbol, "BIST:BIMAS");
});

test("chart data-symbol has highest priority", () => {
  const symbol = detection.chooseSymbol({
    urlSymbol: "BIST:HEDEF",
    chartValues: ["BIST:BIMAS"],
    toolbarValues: ["HEDEF"],
    title: "HEDEF — TradingView"
  });
  assert.equal(symbol, "BIST:BIMAS");
});

test("URL remains a safe fallback when DOM context is empty", () => {
  assert.equal(detection.chooseSymbol({ urlSymbol: "NASDAQ:AAPL" }), "NASDAQ:AAPL");
  assert.equal(detection.chooseSymbol({ urlSymbol: "not a symbol" }), null);
});

test("detector explains where the selected symbol came from", () => {
  const result = detection.chooseSymbolDetails({
    urlSymbol: "BIST:HEDEF",
    chartValues: ["BIST:BIMAS"],
    toolbarValues: ["HEDEF"],
    title: "BIMAS — TradingView"
  });
  assert.equal(result.symbol, "BIST:BIMAS");
  assert.equal(result.source, "grafik verisi");
  assert.ok(result.confidence >= 90);
});

test("exchange hint in the chart rescues saved-layout URLs without a symbol query", () => {
  const result = detection.chooseSymbolDetails({
    chartValues: ["HEDEF HOLDİNG A.Ş. · 15 · BIST"],
    toolbarValues: ["HEDEF"],
    title: "HEDEF 195,00 — TradingView"
  });
  assert.equal(result.symbol, "BIST:HEDEF");
  assert.equal(result.source, "grafik başlığı");
});
