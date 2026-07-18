import { readFile } from "node:fs/promises";
import { z } from "zod";

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const calendarSchema = z.object({
  market: z.literal("BIST"),
  timezone: z.literal("Europe/Istanbul"),
  regularSession: z.object({ open: hhmm, close: hhmm }),
  newEntryCutoff: hhmm,
  forcedExit: hhmm,
  holidays: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  lastReviewed: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sourceNote: z.string()
});

type CalendarConfiguration = z.infer<typeof calendarSchema>;

export class ExchangeCalendar {
  private configuration: CalendarConfiguration | null = null;

  constructor(private readonly path: string) {}

  async load(): Promise<void> {
    this.configuration = calendarSchema.parse(JSON.parse(await readFile(this.path, "utf8")));
  }

  canOpenPosition(now: Date): { allowed: boolean; reason: string } {
    const configuration = this.requireConfiguration();
    const local = localParts(now);
    if (local.weekday === "Sat" || local.weekday === "Sun") return { allowed: false, reason: "BIST hafta sonu kapalı" };
    if (configuration.holidays.includes(local.date)) return { allowed: false, reason: "BIST tatil takviminde" };
    const minute = local.hour * 60 + local.minute;
    const open = toMinutes(configuration.regularSession.open);
    const cutoff = toMinutes(configuration.newEntryCutoff);
    if (minute < open) return { allowed: false, reason: "Normal seans henüz başlamadı" };
    if (minute >= cutoff) return { allowed: false, reason: `Yeni giriş kesim saati geçti (${configuration.newEntryCutoff})` };
    return { allowed: true, reason: "Yeni giriş zaman penceresi açık" };
  }

  mustForceExit(now: Date): boolean {
    const configuration = this.requireConfiguration();
    const local = localParts(now);
    if (local.weekday === "Sat" || local.weekday === "Sun" || configuration.holidays.includes(local.date)) return false;
    return local.hour * 60 + local.minute >= toMinutes(configuration.forcedExit);
  }

  dateKey(now: Date): string {
    return localParts(now).date;
  }

  health(now = new Date()): { state: "OK" | "WARN" | "BLOCKED"; detail: string } {
    if (!this.configuration) return { state: "BLOCKED", detail: "Borsa takvimi yüklenmedi" };
    const reviewed = new Date(`${this.configuration.lastReviewed}T00:00:00Z`).getTime();
    const ageDays = Math.floor((now.getTime() - reviewed) / 86_400_000);
    return ageDays > 90
      ? { state: "WARN", detail: `Borsa takvimi ${ageDays} gündür gözden geçirilmedi` }
      : { state: "OK", detail: `Takvim son kontrol: ${this.configuration.lastReviewed}` };
  }

  private requireConfiguration(): CalendarConfiguration {
    if (!this.configuration) throw new Error("Borsa takvimi yüklenmedi; yeni emirler kapalı");
    return this.configuration;
  }
}

function toMinutes(value: string): number {
  const [hour = "0", minute = "0"] = value.split(":");
  return Number(hour) * 60 + Number(minute);
}

function localParts(date: Date): { date: string; weekday: string; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes): string => parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    weekday: value("weekday"),
    hour: Number(value("hour")),
    minute: Number(value("minute"))
  };
}
