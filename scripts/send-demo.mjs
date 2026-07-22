import { loadDotEnv, readConfig } from "../server/config.mjs";

loadDotEnv();
const config = readConfig();
if (!config.webhookReady) {
  console.error("Önce .env içinde FINPILOT_WEBHOOK_SECRET ayarlayın.");
  process.exit(1);
}
const now = new Date();
const payload = {
  version: "2.0", event: "ANALYSIS", signalId: `DEMO-${now.getTime()}`, nonce: `DEMO-${now.getTime()}`,
  symbol: "DEMO", exchange: "BIST", marketType: "STOCK", timeframe: "15", barTime: now.toISOString(), sentAt: now.toISOString(), confirmed: true,
  data: { fresh: true, volumeAvailable: true, enoughHistory: true },
  metrics: { price: 105, open: 104.5, high: 105.3, low: 104.7, volume: 1800000, averageVolume: 1000000, ema9: 104, ema21: 103, ema50: 100, vwap: 104.5, atr: 2, atrPercent: 1.9, rsi: 62, adx: 28, macdHistogram: 0.8, relativeVolume: 1.8, previousHigh: 104.8, swingLow: 101, relativeStrength20: 0.03, hourBullish: true, fourHourBullish: true, dailyBullish: true, weeklyBullish: true, dailyBearish: false, weeklyBearish: false, benchmarkBullish: true },
  webhookKey: config.webhookSecret
};
const response = await fetch(`http://${config.host}:${config.port}/api/webhooks/tradingview`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
console.log(response.status, await response.text());
