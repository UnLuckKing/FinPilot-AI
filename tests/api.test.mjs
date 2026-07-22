import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { EventStore } from "../server/store.mjs";
import { createFinPilotServer } from "../server/app.mjs";

const NOW = new Date("2026-07-23T10:00:00.000Z");

test("HTTP sağlık, kimlik doğrulama, kabul ve tekrar koruması birlikte çalışır", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "finpilot-api-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const store = new EventStore(join(directory, "events.jsonl"));
  await store.init();
  const secret = "s".repeat(32);
  const config = {
    webhookReady: true, webhookSecret: secret, maxBodyBytes: 65_536, maxSignalAgeSeconds: 1200,
    trustProxy: false, allowedIps: [], rateLimitWindowMs: 60_000, rateLimitMax: 100
  };
  const server = createFinPilotServer({ config, store, publicDirectory: new URL("../public", import.meta.url).pathname, clock: () => NOW });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;

  const health = await fetch(`${base}/api/health`).then((response) => response.json());
  assert.equal(health.ok, true);
  const pageResponse = await fetch(`${base}/`);
  assert.equal(pageResponse.status, 200);
  assert.match(await pageResponse.text(), /FinPilot Universal Analyzer/u);

  const payload = {
    version: "2.0", event: "ANALYSIS", signalId: "api-1", nonce: "api-nonce-1", symbol: "TEST", exchange: "BIST",
    marketType: "STOCK", timeframe: "15", sentAt: NOW.toISOString(), confirmed: true, webhookKey: secret,
    data: { fresh: true, volumeAvailable: true, enoughHistory: true },
    metrics: { price: 105, open: 104.5, high: 105.2, low: 104.7, volume: 1800000, averageVolume: 1000000, ema9: 104, ema21: 103, ema50: 100, vwap: 104.5, atr: 2, rsi: 62, adx: 28, macdHistogram: 1, relativeVolume: 1.8, previousHigh: 104.8, swingLow: 101, relativeStrength20: 0.03, hourBullish: true, fourHourBullish: true, dailyBullish: true, weeklyBullish: true, dailyBearish: false, weeklyBearish: false, benchmarkBullish: true }
  };
  const denied = await fetch(`${base}/api/webhooks/tradingview`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...payload, webhookKey: "x".repeat(32) }) });
  assert.equal(denied.status, 401);

  const accepted = await fetch(`${base}/api/webhooks/tradingview`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  assert.equal(accepted.status, 202);
  const acceptedBody = await accepted.json();
  assert.equal(acceptedBody.analysis.verdict, "YATIR");

  const duplicate = await fetch(`${base}/api/webhooks/tradingview`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }).then((response) => response.json());
  assert.equal(duplicate.duplicate, true);
  const dashboard = await fetch(`${base}/api/dashboard`).then((response) => response.json());
  assert.equal(dashboard.analyses.length, 1);
});
