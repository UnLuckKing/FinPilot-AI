import { readFile } from "node:fs/promises";

const livePath = new URL("../tradingview/FinPilot_Live_Indicator.pine", import.meta.url);
const backtestPath = new URL("../tradingview/FinPilot_Backtest_Strategy.pine", import.meta.url);
const [live, backtest] = await Promise.all([readFile(livePath, "utf8"), readFile(backtestPath, "utf8")]);

const requiredLive = [
  "//@version=6",
  "barstate.isconfirmed",
  "alert.freq_once_per_bar_close",
  "request.security",
  "lookahead = barmerge.lookahead_on",
  "[1]",
  "ONAYLI AL",
  "ONAYLI SAT",
  "gatewayToken"
];
const requiredBacktest = [
  "//@version=6",
  "calc_on_every_tick = false",
  "commission_value",
  "slippage =",
  "use_bar_magnifier = true",
  "strategy.exit",
  "Seans sonu",
  "Dönem dışı",
  "strategy.max_drawdown"
];

const missing = [
  ...requiredLive.filter((item) => !live.includes(item)).map((item) => `live: ${item}`),
  ...requiredBacktest.filter((item) => !backtest.includes(item)).map((item) => `backtest: ${item}`)
];
if (backtest.includes("calc_on_every_tick = true")) missing.push("backtest tick hesaplaması içeriyor");
if (missing.length) {
  console.error(`Pine statik kontrolü başarısız:\n${missing.join("\n")}`);
  process.exit(1);
}
console.log("Pine statik kontrolleri geçti. Not: kesin derleme yalnız TradingView Pine Editor içinde yapılabilir.");
