import { readFile } from "node:fs/promises";
import { z } from "zod";

const restrictionSchema = z.object({
  updatedAt: z.iso.datetime({ offset: true }),
  expiresAt: z.iso.datetime({ offset: true }),
  blockedSymbols: z.array(z.string().regex(/^[A-Z0-9]{2,20}$/)),
  reasons: z.record(z.string(), z.string()),
  failClosedWhenStale: z.boolean()
});

type RestrictionFile = z.infer<typeof restrictionSchema>;

export interface RestrictionDecision {
  allowed: boolean;
  reason: string;
}

export class RestrictionService {
  private data: RestrictionFile | null = null;
  private loadError: string | null = null;

  constructor(private readonly path: string) {}

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.path, "utf8");
      this.data = restrictionSchema.parse(JSON.parse(raw));
      this.loadError = null;
    } catch (error) {
      this.data = null;
      this.loadError = error instanceof Error ? error.message : "Kısıt dosyası okunamadı";
    }
  }

  check(symbol: string, now = new Date()): RestrictionDecision {
    if (!this.data) return { allowed: false, reason: `Kısıt verisi yok: ${this.loadError ?? "bilinmeyen hata"}` };
    if (new Date(this.data.expiresAt).getTime() <= now.getTime() && this.data.failClosedWhenStale) {
      return { allowed: false, reason: "Kısıt verisi süresi dolmuş; güvenli biçimde işlem engellendi" };
    }
    if (this.data.blockedSymbols.includes(symbol)) {
      return { allowed: false, reason: this.data.reasons[symbol] ?? "Araç işlem kısıt listesinde" };
    }
    return { allowed: true, reason: "Güncel kısıt listesinde engel yok" };
  }

  health(now = new Date()): { state: "OK" | "BLOCKED"; detail: string } {
    const decision = this.check("__HEALTH__", now);
    return { state: decision.allowed ? "OK" : "BLOCKED", detail: decision.reason };
  }
}
