import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { EventStore } from "../server/store.mjs";

test("analiz ve sonuç yeniden başlatmada JSONL günlüğünden geri yüklenir", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "finpilot-store-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "events.jsonl");
  const first = new EventStore(path);
  await first.init();
  await first.appendAnalysis({ id: "signal-1", analyzedAt: "2026-07-23T10:00:00Z", verdict: "YATIR", market: "STOCK" }, "nonce-1");
  await first.appendOutcome({ signalId: "signal-1", result: "TARGET1" }, "nonce-2");
  assert.equal(first.hasNonce("nonce-1"), true);

  const second = new EventStore(path);
  await second.init();
  const snapshot = second.snapshot();
  assert.equal(snapshot.analyses.length, 1);
  assert.equal(snapshot.analyses[0].outcome.result, "TARGET1");
  assert.equal(snapshot.evidence.observedAccuracy, 100);
  assert.equal((await readFile(path, "utf8")).split("\n").filter(Boolean).length, 2);
});
