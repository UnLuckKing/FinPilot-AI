import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

test("manifest is minimal MV3 and has no broker permissions", async () => {
  const manifest = JSON.parse(await readFile(new URL("manifest.json", root), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, "2.2.0");
  assert.equal(manifest.background.type, "module");
  assert.equal(manifest.side_panel.default_path, "sidepanel.html");
  assert.ok(manifest.permissions.includes("sidePanel"));
  assert.ok(manifest.permissions.includes("scripting"));
  assert.ok(!manifest.permissions.includes("cookies"));
  assert.ok(!manifest.permissions.includes("webRequest"));
  assert.ok(manifest.host_permissions.every((host) => host.startsWith("https://")));
  assert.ok(manifest.host_permissions.some((host) => host.includes("kap.org.tr")));
});

test("extension contains no remote scripts, eval or unsafe dynamic HTML", async () => {
  const files = ["background.js", "content-script.js", "sidepanel.js", "sidepanel.html"];
  for (const file of files) {
    const content = await readFile(new URL(file, root), "utf8");
    assert.doesNotMatch(content, /\beval\s*\(/u, file);
    assert.doesNotMatch(content, /\.innerHTML\s*=/u, file);
    assert.doesNotMatch(content, /<script[^>]+src=["']https?:/u, file);
  }
});
