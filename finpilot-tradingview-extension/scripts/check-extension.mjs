import { access, readFile, readdir } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const required = [
  "manifest.json",
  "background.js",
  "content-script.js",
  "sidepanel.html",
  "sidepanel.css",
  "sidepanel.js",
  "assets/icon.svg",
  "assets/icon16.png",
  "assets/icon32.png",
  "assets/icon48.png",
  "assets/icon128.png",
  "lib/engine.js",
  "lib/detection-global.js",
  "lib/discovery.js",
  "lib/indicators.js",
  "lib/lifecycle.js",
  "lib/prefilter.js",
  "lib/providers.js",
  "lib/risk.js",
  "lib/symbols.js",
  "lib/tracker.js",
  "lib/universe.js",
  "KURULUM.md"
];

for (const file of required) await access(path.join(root, file), constants.R_OK);
const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
if (manifest.manifest_version !== 3) throw new Error("Manifest V3 gerekli");
if (manifest.background?.type !== "module") throw new Error("ES module service worker gerekli");
if (!manifest.permissions?.includes("sidePanel")) throw new Error("sidePanel izni eksik");
if (!manifest.permissions?.includes("scripting")) throw new Error("Grafik algılama onarımı için scripting izni eksik");

const sourceFiles = await collect(root);
for (const file of sourceFiles.filter((name) => /\.(?:js|mjs|html)$/u.test(name))) {
  const content = await readFile(file, "utf8");
  if (/\beval\s*\(/u.test(content)) throw new Error(`eval yasak: ${file}`);
  if (/\.innerHTML\s*=/u.test(content)) throw new Error(`innerHTML ataması yasak: ${file}`);
  if (/<script[^>]+src=["']https?:/u.test(content)) throw new Error(`Uzaktan script yasak: ${file}`);
}

console.log(`Extension check passed: ${required.length} required files, ${sourceFiles.length} total files.`);

async function collect(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.endsWith(".zip")) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await collect(full));
    else result.push(full);
  }
  return result;
}
