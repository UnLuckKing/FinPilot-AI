import { timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { PrismaClient } from "@prisma/client";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { WebSocket, WebSocketServer } from "ws";
import { tradingViewSignalSchema, type DashboardSnapshot } from "@finpilot/core";
import type { AppEnv } from "./env.js";
import { SessionAuth } from "./auth.js";
import type { TradingOrchestrator } from "./orchestrator.js";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));

export interface ServerOptions {
  env: AppEnv;
  prisma: PrismaClient;
  orchestrator: TradingOrchestrator;
}

export function createFinPilotServer(options: ServerOptions) {
  const { env, prisma, orchestrator } = options;
  const app = express();
  const server = createServer(app);
  const sockets = new WebSocketServer({ server, path: "/ws" });
  const auth = new SessionAuth(env);

  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(env.NODE_ENV === "production" ? helmet() : helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: env.NODE_ENV === "development" ? "http://127.0.0.1:4311" : false, credentials: true }));
  app.use(express.json({ limit: "64kb" }));
  app.use(cookieParser());
  app.use((request, response, next) => requireHttpsInProduction(request, response, next, env));

  app.get("/api/health", (_request, response) => {
    response.json({ status: "ok", service: "FinPilot AutoTrader v1", time: new Date().toISOString() });
  });

  app.post("/api/auth/login", rateLimit({ windowMs: 15 * 60_000, limit: 10 }), (request, response) => {
    const password = typeof request.body?.password === "string" ? request.body.password : "";
    const result = auth.login(password, response);
    if (!result) return response.status(401).json({ error: "Giriş başarısız" });
    return response.json(result);
  });
  app.post("/api/auth/logout", auth.requireWrite, (request, response) => {
    auth.logout(request, response);
    response.status(204).end();
  });

  app.post(
    "/api/webhooks/tradingview",
    rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false }),
    asyncHandler(async (request, response) => {
      const parsed = tradingViewSignalSchema.safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({ error: "Geçersiz alarm gövdesi", issues: parsed.error.issues.map((issue) => issue.path.join(".")) });
        return;
      }
      const suppliedToken = parsed.data.gatewayToken ?? request.header("x-finpilot-token") ?? "";
      if (!safeEqual(suppliedToken, env.TV_WEBHOOK_SECRET)) {
        response.status(401).json({ error: "Webhook doğrulanamadı" });
        return;
      }
      const { gatewayToken: _discarded, ...sanitized } = parsed.data;
      try {
        const event = await prisma.webhookEvent.create({
          data: {
            idempotencyKey: sanitized.signalId,
            nonce: sanitized.nonce,
            signalId: sanitized.signalId,
            payloadJson: JSON.stringify(sanitized),
            status: "PENDING"
          }
        });
        response.status(202).json({ accepted: true, eventId: event.id, signalId: sanitized.signalId });
        setImmediate(() => void processEvent(event.id, prisma, orchestrator));
      } catch (error) {
        if (isUniqueConstraint(error)) {
          response.status(200).json({ accepted: true, duplicate: true, signalId: sanitized.signalId });
          return;
        }
        throw error;
      }
    })
  );

  app.get("/api/dashboard", auth.requireRead, asyncHandler(async (_request, response) => {
    response.json(await orchestrator.dashboard());
  }));
  app.post("/api/risk/kill-switch", auth.requireWrite, asyncHandler(async (_request, response) => {
    await orchestrator.activateKillSwitch("DASHBOARD");
    response.json({ ok: true, message: "Yeni emirler durduruldu; koruyucu emirler bırakıldı" });
  }));
  app.post("/api/risk/kill-switch/clear", auth.requireWrite, asyncHandler(async (request, response) => {
    await orchestrator.clearKillSwitch("DASHBOARD", String(request.body?.confirmation ?? ""));
    response.json({ ok: true });
  }));
  app.post("/api/mode/live", auth.requireWrite, asyncHandler(async (request, response) => {
    await orchestrator.enableLive("DASHBOARD", String(request.body?.confirmation ?? ""));
    response.json({ ok: true });
  }));
  app.post("/api/positions/close-all", auth.requireWrite, asyncHandler(async (_request, response) => {
    const orders = await orchestrator.closeAllPositions("DASHBOARD");
    response.json({ ok: true, orders });
  }));
  app.put("/api/settings/capital", auth.requireWrite, asyncHandler(async (request, response) => {
    await orchestrator.updateCapital(Number(request.body?.capitalTry), "DASHBOARD");
    response.json({ ok: true });
  }));
  app.put("/api/settings/watchlist", auth.requireWrite, asyncHandler(async (request, response) => {
    if (!Array.isArray(request.body?.symbols)) throw new Error("symbols dizi olmalıdır");
    await orchestrator.updateWatchlist(request.body.symbols as string[], "DASHBOARD");
    response.json({ ok: true });
  }));
  app.post("/api/paper/candle", auth.requireWrite, asyncHandler(async (request, response) => {
    if (env.TRADING_MODE !== "PAPER") {
      response.status(403).json({ error: "Bu uç nokta yalnız kâğıt modunda kullanılabilir" });
      return;
    }
    const executions = await orchestrator.processPaperCandle(request.body);
    response.json({ executions });
  }));

  const webDist = resolve(currentDirectory, "../../web/dist");
  app.use(express.static(webDist, { index: false, maxAge: env.NODE_ENV === "production" ? "1h" : 0 }));
  app.get("/{*path}", (_request, response) => response.sendFile(resolve(webDist, "index.html")));

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    const message = error instanceof Error ? error.message : "Beklenmeyen sunucu hatası";
    console.error(JSON.stringify({ level: "error", message: redactMessage(message), at: new Date().toISOString() }));
    response.status(400).json({ error: message });
  });

  sockets.on("connection", async (socket, request) => {
    if (!auth.authorizeWebSocket(request.headers.cookie, request.socket.remoteAddress)) {
      socket.close(1008, "Oturum gerekli");
      return;
    }
    socket.send(JSON.stringify({ type: "snapshot", data: await orchestrator.dashboard() }));
  });

  return {
    app,
    server,
    broadcast(snapshot: DashboardSnapshot): void {
      const payload = JSON.stringify({ type: "snapshot", data: snapshot });
      for (const socket of sockets.clients) {
        if (socket.readyState === WebSocket.OPEN) socket.send(payload);
      }
    }
  };
}

export async function processPendingEvents(prisma: PrismaClient, orchestrator: TradingOrchestrator): Promise<void> {
  const events = await prisma.webhookEvent.findMany({
    where: { status: { in: ["PENDING", "RETRY"] }, attemptCount: { lt: 3 } },
    orderBy: { receivedAt: "asc" },
    take: 100
  });
  for (const event of events) await processEvent(event.id, prisma, orchestrator);
}

async function processEvent(id: string, prisma: PrismaClient, orchestrator: TradingOrchestrator): Promise<void> {
  const event = await prisma.webhookEvent.findUnique({ where: { id } });
  if (!event || event.status === "PROCESSED") return;
  const claimed = await prisma.webhookEvent.updateMany({
    where: { id, status: { in: ["PENDING", "RETRY"] } },
    data: { status: "PROCESSING", attemptCount: { increment: 1 } }
  });
  if (claimed.count !== 1) return;
  try {
    const signal = tradingViewSignalSchema.omit({ gatewayToken: true }).parse(JSON.parse(event.payloadJson));
    await orchestrator.handleSignal(signal);
    await prisma.webhookEvent.update({ where: { id }, data: { status: "PROCESSED", processedAt: new Date(), error: null } });
  } catch (error) {
    const current = await prisma.webhookEvent.findUniqueOrThrow({ where: { id } });
    await prisma.webhookEvent.update({
      where: { id },
      data: {
        status: current.attemptCount >= 3 ? "FAILED" : "RETRY",
        error: redactMessage(error instanceof Error ? error.message : "Bilinmeyen işleme hatası")
      }
    });
  }
}

function asyncHandler(handler: (request: Request, response: Response, next: NextFunction) => Promise<void>) {
  return (request: Request, response: Response, next: NextFunction): void => {
    void handler(request, response, next).catch(next);
  };
}

function requireHttpsInProduction(request: Request, response: Response, next: NextFunction, env: AppEnv): void {
  if (env.NODE_ENV !== "production" || request.secure || request.header("x-forwarded-proto") === "https") return next();
  response.status(426).json({ error: "Üretimde HTTPS zorunludur" });
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function isUniqueConstraint(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === "P2002";
}

function redactMessage(message: string): string {
  return message.replace(/(token|secret|password|api.?key)\s*[=:]\s*[^\s,;]+/gi, "$1=[MASKED]");
}
