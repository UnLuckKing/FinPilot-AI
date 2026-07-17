import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { createBroker } from "./broker-factory.js";
import { loadEnv } from "./env.js";
import { ExchangeCalendar } from "./exchange-calendar.js";
import { TradingOrchestrator } from "./orchestrator.js";
import { OptionalTelegramNotifier } from "./notifier.js";
import { RestrictionService } from "./restrictions.js";
import { createFinPilotServer, processPendingEvents } from "./server.js";

const env = loadEnv();
process.env.DATABASE_URL = env.DATABASE_URL;
const prisma = new PrismaClient();
await prisma.$connect();

const savedConfiguration = await prisma.userConfiguration.findUnique({ where: { id: "singleton" } });
const broker = await createBroker(env, savedConfiguration?.capitalTry ?? 100_000);
const restrictions = new RestrictionService(fileURLToPath(new URL("../../../config/restrictions.json", import.meta.url)));
const calendar = new ExchangeCalendar(fileURLToPath(new URL("../../../config/exchange-calendar.json", import.meta.url)));
const notifier = new OptionalTelegramNotifier(env);

let broadcast: ((snapshot: Awaited<ReturnType<TradingOrchestrator["dashboard"]>>) => void) | undefined;
const orchestrator = new TradingOrchestrator({
  prisma,
  broker,
  restrictions,
  calendar,
  env,
  notify: (notification) => notifier.send(notification),
  broadcast: (snapshot) => broadcast?.(snapshot)
});
const runtime = createFinPilotServer({ env, prisma, orchestrator });
broadcast = runtime.broadcast;

await orchestrator.startup();
await processPendingEvents(prisma, orchestrator);
const retryTimer = setInterval(() => void processPendingEvents(prisma, orchestrator), 5_000);
retryTimer.unref();
const sessionTimer = setInterval(() => void orchestrator.sessionWatchdog(), 15_000);
sessionTimer.unref();
const reconciliationTimer = setInterval(() => void orchestrator.reconciliationWatchdog(), 30_000);
reconciliationTimer.unref();

runtime.server.listen(env.PORT, env.HOST, () => {
  console.log(`FinPilot AutoTrader v1: http://${env.HOST}:${env.PORT} — ${env.TRADING_MODE}`);
});

const shutdown = async (signal: string): Promise<void> => {
  console.log(`${signal}: güvenli kapanış başlatıldı`);
  clearInterval(retryTimer);
  clearInterval(sessionTimer);
  clearInterval(reconciliationTimer);
  runtime.server.close();
  await prisma.$disconnect();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
