import { z } from "zod";

const booleanString = z.enum(["true", "false"]).transform((value) => value === "true");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4310),
  DATABASE_URL: z.string().default("file:../data/finpilot.db"),
  TRADING_MODE: z.enum(["PAPER", "LIVE"]).default("PAPER"),
  LIVE_MODE_ENABLED: booleanString.default(false),
  ALLOW_LOCAL_PAPER_NO_AUTH: booleanString.default(true),
  TV_WEBHOOK_SECRET: z.string().min(32).default("development-webhook-secret-change-me"),
  SESSION_SECRET: z.string().min(32).default("development-session-secret-change-me"),
  ADMIN_PASSWORD: z.string().min(8).default("finpilot-paper"),
  BROKER_ADAPTER: z.enum(["PAPER", "OSMANLI", "MATRIKS", "IDEAL"]).default("PAPER"),
  OSMANLI_WEBHOOK_URL: z.string().optional(),
  OSMANLI_WEBHOOK_TEMPLATE_PATH: z.string().optional(),
  OSMANLI_API_TOKEN: z.string().optional(),
  FINPILOT_MASTER_KEY: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional()
});

export type AppEnv = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const parsed = envSchema.parse(source);
  if (parsed.NODE_ENV === "production") {
    const weak = [
      parsed.TV_WEBHOOK_SECRET.includes("change-me"),
      parsed.SESSION_SECRET.includes("change-me"),
      parsed.ADMIN_PASSWORD === "finpilot-paper"
    ];
    if (weak.some(Boolean)) throw new Error("Üretimde varsayılan güvenlik sırları kullanılamaz");
    if (parsed.HOST !== "127.0.0.1" && parsed.ALLOW_LOCAL_PAPER_NO_AUTH) {
      throw new Error("Harici ağ dinlemesinde kimliksiz yerel erişim kapatılmalıdır");
    }
  }
  if (parsed.TRADING_MODE === "LIVE" && !parsed.LIVE_MODE_ENABLED) {
    throw new Error("TRADING_MODE=LIVE için LIVE_MODE_ENABLED=true gerekir");
  }
  return parsed;
}
