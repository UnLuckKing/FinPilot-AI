import type { AppEnv } from "./env.js";

export interface SafeNotification {
  event: "SIGNAL" | "ORDER" | "EXECUTION" | "RISK" | "CONNECTION";
  message: string;
}

export class OptionalTelegramNotifier {
  constructor(private readonly env: AppEnv, private readonly fetcher: typeof fetch = fetch) {}

  async send(notification: SafeNotification): Promise<void> {
    if (!this.env.TELEGRAM_BOT_TOKEN || !this.env.TELEGRAM_CHAT_ID) return;
    const safeMessage = notification.message.replace(/(token|secret|password|api.?key)/gi, "[MASKED]").slice(0, 500);
    const endpoint = `https://api.telegram.org/bot${this.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
    const response = await this.fetcher(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: this.env.TELEGRAM_CHAT_ID, text: `FinPilot ${notification.event}: ${safeMessage}` }),
      signal: AbortSignal.timeout(8_000)
    });
    if (!response.ok) throw new Error(`Telegram bildirimi HTTP ${response.status}`);
  }
}
