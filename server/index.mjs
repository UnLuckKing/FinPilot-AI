import { loadDotEnv, readConfig } from "./config.mjs";
import { EventStore } from "./store.mjs";
import { createFinPilotServer } from "./app.mjs";

loadDotEnv();
const config = readConfig();
const store = new EventStore(config.dataFile);
await store.init();

const server = createFinPilotServer({ config, store });
server.listen(config.port, config.host, () => {
  console.log(`FinPilot Universal Analyzer: http://${config.host}:${config.port}`);
  if (!config.webhookReady) console.warn("Webhook kapalı: .env içinde en az 32 karakterlik FINPILOT_WEBHOOK_SECRET ayarlayın.");
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
