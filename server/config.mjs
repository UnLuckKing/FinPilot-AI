import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export function loadDotEnv(path = resolve(process.cwd(), ".env")) {
  if (!existsSync(path)) return;
  const source = readFileSync(path, "utf8");
  for (const rawLine of source.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

export function readConfig(env = process.env) {
  const port = integer(env.FINPILOT_PORT, 4310, 1, 65_535);
  const webhookSecret = String(env.FINPILOT_WEBHOOK_SECRET ?? "").trim();
  const allowedIps = String(env.FINPILOT_ALLOWED_IPS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return Object.freeze({
    host: String(env.FINPILOT_HOST ?? "127.0.0.1"),
    port,
    dataFile: resolve(process.cwd(), env.FINPILOT_DATA_FILE ?? "./data/events.jsonl"),
    webhookSecret,
    webhookReady: webhookSecret.length >= 32,
    trustProxy: String(env.FINPILOT_TRUST_PROXY ?? "false").toLowerCase() === "true",
    allowedIps,
    maxBodyBytes: 64 * 1024,
    maxSignalAgeSeconds: 6 * 60,
    rateLimitWindowMs: 60_000,
    rateLimitMax: 180
  });
}

function integer(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}
