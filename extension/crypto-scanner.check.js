const assert = require("node:assert/strict");
const engine = require("./engine.js");
const scanner = require("./crypto-scanner.js");

const now = new Date("2026-07-16T12:00:00Z");
const FOUR_HOURS = 4 * 60 * 60 * 1000;

function filters(tickSize = "0.01", stepSize = "0.0001") {
  return [{ filterType: "PRICE_FILTER", tickSize }, { filterType: "LOT_SIZE", stepSize }];
}

const exchangeInfo = { symbols: [
  { symbol: "BTCUSDT", baseAsset: "BTC", quoteAsset: "USDT", status: "TRADING", isSpotTradingAllowed: true, permissions: ["SPOT"], filters: filters("0.01", "0.00001") },
  { symbol: "ETHUSDT", baseAsset: "ETH", quoteAsset: "USDT", status: "TRADING", isSpotTradingAllowed: true, permissions: ["SPOT"], filters: filters("0.01", "0.0001") },
  { symbol: "USDCUSDT", baseAsset: "USDC", quoteAsset: "USDT", status: "TRADING", isSpotTradingAllowed: true, permissions: ["SPOT"], filters: filters("0.0001", "0.1") },
  { symbol: "BTCUPUSDT", baseAsset: "BTCUP", quoteAsset: "USDT", status: "TRADING", isSpotTradingAllowed: true, permissions: ["SPOT"], filters: filters("0.0001", "0.1") },
  { symbol: "LOWUSDT", baseAsset: "LOW", quoteAsset: "USDT", status: "TRADING", isSpotTradingAllowed: true, permissions: ["SPOT"], filters: filters("0.0001", "0.1") },
] };
const tickers = [
  { symbol: "BTCUSDT", lastPrice: "118000", quoteVolume: "2200000000", count: 2300000, priceChangePercent: "2.4" },
  { symbol: "ETHUSDT", lastPrice: "3900", quoteVolume: "980000000", count: 1800000, priceChangePercent: "1.2" },
  { symbol: "USDCUSDT", lastPrice: "1", quoteVolume: "800000000", count: 900000, priceChangePercent: "0" },
  { symbol: "BTCUPUSDT", lastPrice: "12", quoteVolume: "90000000", count: 80000, priceChangePercent: "8" },
  { symbol: "LOWUSDT", lastPrice: "0.2", quoteVolume: "1000", count: 40, priceChangePercent: "2" },
];

const universe = scanner.parseCryptoUniverse(exchangeInfo, tickers);
assert.deepEqual(universe.map((item) => item.symbol), ["BTCUSDT", "ETHUSDT"]);
assert.equal(universe[0].tickSize, 0.01);
assert.equal(scanner.roundToStep(123.456, 0.01, "down"), 123.45);
assert.equal(scanner.roundToStep(0.12345678, 0.000001, "up"), 0.123457);

function rawKlines(count = 640, startPrice = 100) {
  let close = startPrice;
  const start = now.getTime() - (count + 1) * FOUR_HOURS;
  const values = [];
  for (let index = 0; index < count; index += 1) {
    const openTime = start + index * FOUR_HOURS;
    const open = close;
    close = Math.max(0.01, close + 0.12 + Math.sin(index / 10) * 0.4 + Math.cos(index / 31) * 0.18);
    values.push([openTime, String(open), String(Math.max(open, close) + 0.7), String(Math.min(open, close) - 0.6), String(close), String(1000 + index * 2), openTime + FOUR_HOURS - 1]);
  }
  values.push([now.getTime(), String(close), String(close + 1), String(close - 1), String(close + 0.2), "1200", now.getTime() + FOUR_HOURS]);
  return values;
}

const btcRows = scanner.parseBinanceKlines(rawKlines(640, 100), now);
const ethRows = scanner.parseBinanceKlines(rawKlines(640, 50), now);
assert.equal(btcRows.length, 640);
assert.ok(btcRows.at(-1).closedAt <= now.getTime());
const analysis = engine.analyze(btcRows, scanner.CRYPTO_PROFILE);
const plan = scanner.buildCryptoOrderPlan(btcRows, analysis.latest, universe[0]);
assert.ok(plan.stopLimit < plan.stopTrigger);
assert.ok(plan.stopTrigger < plan.limitBuy);
assert.ok(plan.target2 > plan.target1);
assert.equal(plan.alternatives.length, 3);
assert.ok(plan.validPlanCount >= 1);

const eligibleFixture = scanner.finalizeCryptoRecommendation({ preEligible: true, rankScore: 80, reasons: [], gates: {} }, true, true, true);
assert.equal(eligibleFixture.action, "YATIR");
const blockedFixture = scanner.finalizeCryptoRecommendation({ preEligible: true, rankScore: 80, reasons: [], gates: { liquidity: false } }, false, true, false);
assert.equal(blockedFixture.action, "YATIRMA");
assert.ok(blockedFixture.failedGates.some((gate) => gate.key === "liquidity"));

(async () => {
  const provided = await scanner.fetchCryptoUniverse({ exchangeInfo, tickers });
  assert.equal(provided.assets.length, 2);
  const histories = new Map([["BTCUSDT", btcRows], ["ETHUSDT", ethRows]]);
  const result = await scanner.runScan({ assets: universe, histories, now, displayLimit: 30 });
  assert.equal(result.market, "crypto");
  assert.equal(result.scannedCount, 2);
  assert.equal(result.recommendations.length, 2);
  assert.equal(result.snapshot.length, 2);
  assert.deepEqual(Object.keys(result.recommendations[0].forecasts).sort(), ["1", "42", "6"]);
  assert.deepEqual(result.recommendations[0].forecastDisplay.map((item) => item.label), ["4 SAAT", "1 GÜN", "7 GÜN"]);
  assert.ok(["YATIR", "YATIRMA"].includes(result.recommendations[0].action));
  assert.equal(result.recommendations[0].strategy.comparisons.length, 4);
  assert.ok(result.recommendations[0].validation);
  assert.ok(result.recommendations[0].returnSignature.length >= 30);
  assert.ok(result.recommendations[0].currentBar.high >= result.recommendations[0].currentBar.low);
  assert.equal(result.recommendations[0].orderPlan.alternatives.length, 3);
  assert.ok(Object.values(result.recommendations[0].gateDiagnostics).every((gate) => typeof gate.message === "string"));
  console.log("FinPilot crypto scanner checks: OK");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
