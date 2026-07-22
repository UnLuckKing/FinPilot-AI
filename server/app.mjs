import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { analyzeMarket } from "./engine.mjs";
import { RequestError, assertRecent, authenticateWebhook, validateAnalysisPayload, validateOutcomePayload } from "./validation.mjs";

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json; charset=utf-8" };

export function createFinPilotServer({ config, store, publicDirectory = resolve(process.cwd(), "public"), clock = () => new Date() }) {
  const clients = new Set();
  const limiter = new Map();

  const server = createServer(async (request, response) => {
    securityHeaders(response);
    try {
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
      const clientIp = resolveClientIp(request, config.trustProxy);
      enforceRateLimit(limiter, clientIp, config, clock());

      if (request.method === "GET" && url.pathname === "/api/health") {
        return json(response, 200, { ok: true, service: "FinPilot Universal Analyzer", version: "2.0.0", webhookReady: config.webhookReady, now: clock().toISOString() });
      }
      if (request.method === "GET" && url.pathname === "/api/dashboard") {
        return json(response, 200, { ...store.snapshot(), health: { webhookReady: config.webhookReady, service: "ONLINE" } });
      }
      if (request.method === "GET" && url.pathname === "/api/export") {
        response.setHeader("Content-Disposition", `attachment; filename=finpilot-export-${clock().toISOString().slice(0, 10)}.json`);
        return json(response, 200, store.snapshot());
      }
      if (request.method === "GET" && url.pathname === "/api/events") {
        response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" });
        response.write(`event: connected\ndata: ${JSON.stringify({ now: clock().toISOString() })}\n\n`);
        clients.add(response);
        request.on("close", () => clients.delete(response));
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/webhooks/tradingview") {
        enforceIp(config.allowedIps, clientIp);
        if (!config.webhookReady) throw new RequestError(503, "Webhook anahtarı ayarlanmamış", "NOT_CONFIGURED");
        const body = await readJson(request, config.maxBodyBytes);
        authenticateWebhook(body.webhookKey, config.webhookSecret);
        const eventType = String(body.event ?? "ANALYSIS").toUpperCase();

        if (eventType === "OUTCOME") {
          const outcome = validateOutcomePayload(body);
          assertRecent(outcome.observedAt, config.maxSignalAgeSeconds, clock());
          if (store.hasNonce(outcome.nonce)) return json(response, 200, { ok: true, duplicate: true });
          await store.appendOutcome(outcome, outcome.nonce);
          broadcast(clients, "outcome", outcome);
          return json(response, 202, { ok: true, accepted: "OUTCOME" });
        }

        const signal = validateAnalysisPayload(body);
        assertRecent(signal.sentAt, config.maxSignalAgeSeconds, clock());
        if (store.hasNonce(signal.nonce)) return json(response, 200, { ok: true, duplicate: true });
        const analysis = analyzeMarket(signal, clock());
        await store.appendAnalysis(analysis, signal.nonce);
        broadcast(clients, "analysis", analysis);
        return json(response, 202, { ok: true, accepted: "ANALYSIS", analysis });
      }
      if (request.method === "GET") return serveStatic(response, publicDirectory, url.pathname);
      throw new RequestError(404, "Yol bulunamadı", "NOT_FOUND");
    } catch (error) {
      const status = error instanceof RequestError ? error.status : 500;
      const message = error instanceof RequestError ? error.message : "Sunucu hatası";
      const code = error instanceof RequestError ? error.code : "INTERNAL_ERROR";
      if (status >= 500 && !(error instanceof RequestError)) console.error(error);
      if (!response.headersSent) json(response, status, { ok: false, error: code, message });
      else response.end();
    }
  });

  const heartbeat = setInterval(() => broadcast(clients, "heartbeat", { now: clock().toISOString() }), 25_000);
  heartbeat.unref();
  server.on("close", () => clearInterval(heartbeat));
  return server;
}

async function readJson(request, maxBytes) {
  const contentType = String(request.headers["content-type"] ?? "");
  if (!contentType.toLowerCase().includes("application/json")) throw new RequestError(415, "Content-Type application/json olmalı", "UNSUPPORTED_MEDIA_TYPE");
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw new RequestError(413, "İstek gövdesi çok büyük", "PAYLOAD_TOO_LARGE");
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new RequestError(400, "JSON çözümlenemedi", "INVALID_JSON"); }
}

async function serveStatic(response, root, requestPath) {
  const candidate = requestPath === "/" ? "/index.html" : requestPath;
  const safePath = normalize(candidate).replace(/^(\.\.(\/|\\|$))+/u, "");
  const filePath = resolve(join(root, safePath));
  const rootPath = resolve(root);
  if (!filePath.startsWith(`${rootPath}/`) && filePath !== rootPath) throw new RequestError(403, "Geçersiz dosya yolu", "FORBIDDEN");
  if (!existsSync(filePath)) throw new RequestError(404, "Sayfa bulunamadı", "NOT_FOUND");
  const info = await stat(filePath);
  if (!info.isFile()) throw new RequestError(404, "Sayfa bulunamadı", "NOT_FOUND");
  response.writeHead(200, { "Content-Type": MIME[extname(filePath)] ?? "application/octet-stream", "Content-Length": info.size, "Cache-Control": extname(filePath) === ".html" ? "no-cache" : "public, max-age=3600" });
  createReadStream(filePath).pipe(response);
}

function json(response, status, payload) { const body = JSON.stringify(payload); response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body), "Cache-Control": "no-store" }); response.end(body); }
function broadcast(clients, event, payload) { const frame = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`; for (const client of clients) client.write(frame); }
function resolveClientIp(request, trustProxy) { if (trustProxy) return String(request.headers["x-forwarded-for"] ?? "").split(",")[0].trim() || request.socket.remoteAddress || "unknown"; return request.socket.remoteAddress || "unknown"; }
function enforceIp(allowed, ip) { if (allowed.length && !allowed.includes(ip)) throw new RequestError(403, "Kaynak IP izinli değil", "IP_DENIED"); }
function enforceRateLimit(map, ip, config, now) { const key = String(ip); const current = map.get(key); if (!current || now.getTime() - current.startedAt >= config.rateLimitWindowMs) { map.set(key, { startedAt: now.getTime(), count: 1 }); return; } current.count += 1; if (current.count > config.rateLimitMax) throw new RequestError(429, "Çok fazla istek", "RATE_LIMITED"); if (map.size > 5_000) for (const [entry, value] of map) if (now.getTime() - value.startedAt > config.rateLimitWindowMs * 2) map.delete(entry); }
function securityHeaders(response) { response.setHeader("X-Content-Type-Options", "nosniff"); response.setHeader("X-Frame-Options", "DENY"); response.setHeader("Referrer-Policy", "no-referrer"); response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()"); response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"); }
