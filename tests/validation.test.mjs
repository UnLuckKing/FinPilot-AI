import test from "node:test";
import assert from "node:assert/strict";
import { RequestError, authenticateWebhook, validateAnalysisPayload, validateOutcomePayload } from "../server/validation.mjs";

test("webhook anahtarı sabit zamanlı eşleşmeyle doğrulanır", () => {
  const secret = "a".repeat(32);
  assert.doesNotThrow(() => authenticateWebhook(secret, secret));
  assert.throws(() => authenticateWebhook("b".repeat(32), secret), RequestError);
  assert.throws(() => authenticateWebhook("kısa", secret), RequestError);
});

test("analiz yükü gereksiz alanları atar ve sayıları sınar", () => {
  const parsed = validateAnalysisPayload({
    event: "ANALYSIS", signalId: "x-1", symbol: "THYAO", sentAt: "2026-07-23T10:00:00Z", confirmed: true,
    metrics: { price: "100", atr: 2, ignored: "secret" }, data: { fresh: true }, extra: "discard"
  });
  assert.equal(parsed.metrics.price, 100);
  assert.equal("extra" in parsed, false);
  assert.equal("ignored" in parsed.metrics, false);
});

test("sonuç türü izin listesi dışına çıkamaz", () => {
  assert.throws(() => validateOutcomePayload({ signalId: "x", result: "PROFIT", observedAt: "2026-07-23T10:00:00Z" }), RequestError);
  const outcome = validateOutcomePayload({ signalId: "x", result: "target1", observedAt: "2026-07-23T10:00:00Z" });
  assert.equal(outcome.result, "TARGET1");
});
