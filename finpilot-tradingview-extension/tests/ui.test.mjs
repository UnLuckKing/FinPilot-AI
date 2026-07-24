import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("every direct sidepanel element reference has a matching HTML id", async () => {
  const html = await readFile(new URL("../sidepanel.html", import.meta.url), "utf8");
  const script = await readFile(new URL("../sidepanel.js", import.meta.url), "utf8");
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/gu)].map((match) => match[1]));
  const references = new Set([...script.matchAll(/elements\.([A-Za-z][A-Za-z0-9]*)/gu)].map((match) => match[1]));
  const missing = [...references].filter((id) => !ids.has(id));
  assert.ok(ids.size >= 60);
  assert.deepEqual(missing, []);
});

test("general market radar controls are present", async () => {
  const html = await readFile(new URL("../sidepanel.html", import.meta.url), "utf8");
  for (const category of ["ALL", "BIST", "US", "CRYPTO", "FOREX", "MACRO"]) {
    assert.match(html, new RegExp(`data-category="${category}"`, "u"));
  }
  assert.match(html, /id="nearestBanner"/u);
  assert.match(html, /id="scanProgressBar"/u);
  assert.match(html, /id="scanDiscovered"/u);
  assert.match(html, /id="scanShortlisted"/u);
  assert.match(html, /id="scannerView" class="view active"/u);
  assert.match(html, /data-direction="LONG"/u);
  assert.match(html, /data-direction="SHORT"/u);
  assert.match(html, /id="bestLongCard"/u);
  assert.match(html, /id="bestShortCard"/u);
  assert.match(html, /id="detectionText"/u);
  assert.match(html, /id="executionGuard"/u);
  assert.match(html, /id="intradayHorizonCard"/u);
  assert.match(html, /id="swingHorizonCard"/u);
  assert.match(html, /id="strategyList"/u);
  assert.match(html, /id="planBPanel"/u);
  assert.match(html, /id="opportunityInbox"/u);
  assert.match(html, /FREE MODE/u);
});
