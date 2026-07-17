import { readFile } from "node:fs/promises";
import {
  DisabledOfficialIntegrationAdapter,
  OsmanliWebhookAdapter,
  PaperBroker,
  type BrokerAdapter
} from "@finpilot/brokers";
import type { AppEnv } from "./env.js";

export async function createBroker(env: AppEnv, capital: number): Promise<BrokerAdapter> {
  if (env.BROKER_ADAPTER === "PAPER") {
    return new PaperBroker({ initialCapital: capital, commissionBps: 10, slippageBps: 8 });
  }
  if (env.BROKER_ADAPTER === "OSMANLI") {
    if (!env.OSMANLI_WEBHOOK_URL || !env.OSMANLI_WEBHOOK_TEMPLATE_PATH) {
      throw new Error("OSMANLI adaptörü için resmî webhook URL'si ve şablon dosyası gerekir");
    }
    const officialTemplate = JSON.parse(await readFile(env.OSMANLI_WEBHOOK_TEMPLATE_PATH, "utf8")) as Record<string, never>;
    return new OsmanliWebhookAdapter({
      endpoint: env.OSMANLI_WEBHOOK_URL,
      officialTemplate,
      ...(env.OSMANLI_API_TOKEN ? { bearerToken: env.OSMANLI_API_TOKEN } : {})
    });
  }
  if (env.BROKER_ADAPTER === "MATRIKS") {
    return new DisabledOfficialIntegrationAdapter("MatriksIQAdapter", "Resmî SDK veya yerel köprü yapılandırılmadı");
  }
  return new DisabledOfficialIntegrationAdapter("IdealAdapter", "Desteklenen resmî terminal entegrasyonu yapılandırılmadı");
}
