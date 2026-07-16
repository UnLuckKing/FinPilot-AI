(function (root, factory) {
  const engine = root.FinPilotEngine || (typeof require !== "undefined" ? require("./engine.js") : null);
  const api = factory(engine);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FinPilotAutoScanner = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (engine) {
  "use strict";

  if (!engine) throw new Error("FinPilotEngine yüklenemedi.");

  const HISTORY_ENDPOINT = "https://www.isyatirim.com.tr/_layouts/15/Isyatirim.Website/Common/Data.aspx/HisseTekil";
  const FUNDAMENTALS_PAGE = "https://www.isyatirim.com.tr/tr-tr/analiz/hisse/Sayfalar/Temel-Degerler-Ve-Oranlar.aspx";
  const BIST_INDEX_CSV = "https://www.borsaistanbul.com/datum/hisse_endeks_ds.csv";
  const KAP_DIRECTORY_PAGE = "https://kap.org.tr/tr/bist-sirketler";
  const KAP_DISCLOSURE_SEARCH = "https://kap.org.tr/tr/bildirim-sorgu";
  const KAP_PUBLIC_FEED = "https://www.kap.org.tr/tr/api/disclosures";
  const FALLBACK_UNIVERSE = [
    "AKBNK", "ALARK", "ASELS", "ASTOR", "BIMAS", "EKGYO", "ENKAI", "EREGL", "FROTO", "GARAN",
    "GUBRF", "ISCTR", "KCHOL", "KRDMD", "MGROS", "OYAKC", "PETKM", "PGSUS", "SAHOL", "SASA",
    "SISE", "TAVHL", "TCELL", "THYAO", "TOASO", "TRALT", "TTKOM", "TUPRS", "VAKBN", "YKBNK",
  ];
  const PROFILE = Object.freeze({
    threshold: 60,
    minimumTrades: 20,
    minimumProfitFactor: 1.25,
    minimumExpectancyR: 0.08,
    minimumModelProbability: 52,
    maximumBrierScore: 0.27,
    minimumDirectionProbability: 56,
    maximumDirectionDownProbability: 36,
    minimumStressProfitability: 55,
    maximumDataAgeBusinessDays: 2,
    universeLimit: 120,
    deepResearchLimit: 12,
    stopAtr: 2,
    rewardRisk: 2,
    horizon: 8,
    maxAtrPct: 10,
    cooldownBars: 3,
    maxHoldingBars: 80,
    allowShort: false,
    commissionPct: 0.10,
    slippagePct: 0.03,
  });

  const KAP_RISK_TERMS = Object.freeze([
    { label: "Devre kesici", pattern: /devre\s+kesici/i },
    { label: "İşlem sırası kapatma", pattern: /işlem\s+sıra(?:sı|sının).*?(?:kapat|durdur)/i },
    { label: "İşlem yasağı", pattern: /işlem\s+yasağı/i },
    { label: "İflas / konkordato", pattern: /iflas|konkordato/i },
    { label: "Temerrüt", pattern: /temerrüt/i },
    { label: "Faaliyet durdurma", pattern: /faaliyet.*?(?:durdur|ara\s+ver)/i },
    { label: "Dava / soruşturma", pattern: /dava|soruşturma|inceleme/i },
    { label: "Sermaye azaltımı", pattern: /sermaye\s+azalt/i },
    { label: "Bedelli sermaye artırımı", pattern: /bedelli\s+sermaye|nakit\s+sermaye\s+artır/i },
    { label: "Yönetim değişikliği", pattern: /(?:üst\s+)?yönetim.*?değişik/i },
  ]);

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

  function parseNumber(value, fallback = NaN) {
    if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
    let text = String(value ?? "").trim().replace(/\s/g, "");
    if (!text) return fallback;
    if (text.includes(",") && text.includes(".")) {
      text = text.lastIndexOf(",") > text.lastIndexOf(".") ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
    } else if (text.includes(",")) text = text.replace(",", ".");
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function parseDate(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    const text = String(value ?? "").trim();
    if (/^\d{10,13}$/.test(text)) return Number(text.length === 10 ? `${text}000` : text);
    const microsoft = text.match(/\/Date\((\d+)/);
    if (microsoft) return Number(microsoft[1]);
    const local = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
    if (local) return Date.UTC(Number(local[3]), Number(local[2]) - 1, Number(local[1]));
    const parsed = Date.parse(text);
    return Number.isFinite(parsed) ? parsed : NaN;
  }

  function formatDate(date) {
    return [String(date.getDate()).padStart(2, "0"), String(date.getMonth() + 1).padStart(2, "0"), date.getFullYear()].join("-");
  }

  function tickSizeForPrice(price) {
    const value = Math.max(0, finite(price));
    if (value < 20) return 0.01;
    if (value < 50) return 0.02;
    if (value < 100) return 0.05;
    if (value < 250) return 0.10;
    if (value < 500) return 0.25;
    if (value < 1000) return 0.50;
    if (value < 2500) return 1;
    return 2.50;
  }

  function roundToTick(value, mode = "nearest") {
    const safe = Math.max(0, finite(value));
    const tick = tickSizeForPrice(safe);
    const units = safe / tick;
    const roundedUnits = mode === "down" ? Math.floor(units + 1e-9) : mode === "up" ? Math.ceil(units - 1e-9) : Math.round(units);
    return Number((roundedUnits * tick).toFixed(3));
  }

  function businessDaysAge(dateText, now = new Date()) {
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(String(dateText || "")) ? new Date(`${dateText}T12:00:00Z`) : new Date(dateText);
    const end = now instanceof Date ? new Date(now) : new Date(now);
    if (!Number.isFinite(parsed.getTime()) || !Number.isFinite(end.getTime())) return Infinity;
    parsed.setUTCHours(12, 0, 0, 0);
    end.setUTCHours(12, 0, 0, 0);
    if (parsed >= end) return 0;
    let days = 0;
    const cursor = new Date(parsed);
    for (let guard = 0; guard < 3700 && cursor < end; guard += 1) {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      const weekday = cursor.getUTCDay();
      if (weekday !== 0 && weekday !== 6 && cursor <= end) days += 1;
    }
    return days;
  }

  function nextBusinessDate(dateText) {
    const date = new Date(`${dateText}T12:00:00Z`);
    if (!Number.isFinite(date.getTime())) return null;
    do date.setUTCDate(date.getUTCDate() + 1); while (date.getUTCDay() === 0 || date.getUTCDay() === 6);
    return date.toISOString().slice(0, 10);
  }

  function buildBistOrderCandidate(rows, latest, definition, preferred = false) {
    const atr = Math.max(Number.EPSILON, finite(latest.atr));
    const tick = tickSizeForPrice(latest.close);
    const limitBuy = roundToTick(definition.entry, "down");
    const stopTrigger = roundToTick(definition.stop, "down");
    const stopLimitBuffer = Math.max(atr * 0.12, tick * 3);
    const stopLimit = roundToTick(stopTrigger - stopLimitBuffer, "down");
    const riskDistance = limitBuy - stopTrigger;
    const target1 = roundToTick(limitBuy + riskDistance * 1.50, "nearest");
    const target2 = roundToTick(limitBuy + riskDistance * 2.20, "nearest");
    const riskPct = limitBuy > 0 ? riskDistance / limitBuy * 100 : Infinity;
    const riskAtr = riskDistance / atr;
    const entryDistanceAtr = (finite(latest.close) - limitBuy) / atr;
    const checks = {
      ordering: limitBuy > 0 && stopLimit > 0 && stopLimit < stopTrigger && stopTrigger < limitBuy && target1 > limitBuy && target2 > target1,
      atrRisk: riskAtr >= 1.45 && riskAtr <= 2.80,
      riskPct: riskPct <= 9,
      entryDistance: entryDistanceAtr >= 0.04 && entryDistanceAtr <= 1.05,
    };
    const failureReasons = [];
    if (!checks.ordering) failureReasons.push("Fiyat sıralaması geçersiz: stop-limit < stop < alış < hedef koşulu sağlanmadı.");
    if (!checks.atrRisk) failureReasons.push(`Stop mesafesi ${riskAtr.toFixed(2)} ATR; gerekli aralık 1.45–2.80 ATR.`);
    if (!checks.riskPct) failureReasons.push(`Stop riski %${riskPct.toFixed(2)}; izin verilen üst sınır %9.00.`);
    if (!checks.entryDistance) failureReasons.push(`Alış limiti son fiyattan ${entryDistanceAtr.toFixed(2)} ATR uzakta; gerekli aralık 0.04–1.05 ATR.`);
    const valid = Object.values(checks).every(Boolean);
    const quality = clamp(100 - Math.abs(riskAtr - 2.05) * 14 - Math.abs(entryDistanceAtr - 0.35) * 11 - Math.max(0, riskPct - 4) * 2 + (preferred ? 6 : 0) - failureReasons.length * 22, 0, 100);
    return {
      id: definition.id,
      label: definition.label,
      explanation: definition.explanation,
      preferred,
      quality,
      valid,
      limitBuy,
      stopTrigger,
      stopLimit,
      stopLimitBuffer,
      target1,
      target2,
      riskDistance,
      riskPct,
      riskAtr,
      entryDistanceAtr,
      rewardRisk1: riskDistance > 0 ? (target1 - limitBuy) / riskDistance : 0,
      rewardRisk2: riskDistance > 0 ? (target2 - limitBuy) / riskDistance : 0,
      checks,
      failureReasons,
      validUntil: nextBusinessDate(rows[rows.length - 1]?.time),
      warning: "Stop-limit emri sert fiyat boşluğunda gerçekleşmeyebilir; bu seviyeler gerçek emir değildir.",
    };
  }

  function buildOrderPlans(rows, latest, strategyId = "trend") {
    const atr = Math.max(Number.EPSILON, finite(latest.atr));
    const close = finite(latest.close);
    const lowerBound = close - atr * 0.95;
    const upperBound = close - atr * 0.06;
    const recentLows = rows.slice(-10).map((row) => row.low).filter(Number.isFinite);
    const swingLow = recentLows.length ? Math.min(...recentLows) : close - atr * PROFILE.stopAtr;
    const supportEntry = clamp(Math.min(close - atr * 0.12, finite(latest.fast, close) + atr * 0.20), lowerBound, upperBound);
    const emaEntry = clamp(finite(latest.fast, close) + atr * 0.08, lowerBound, upperBound);
    const balancedEntry = clamp(close - atr * 0.24, lowerBound, upperBound);
    const preferredId = strategyId === "pullback" ? "ema-retest" : strategyId === "trend" ? "support-pullback" : "atr-balanced";
    const definitions = [
      {
        id: "support-pullback",
        label: "Destek geri çekilmesi",
        explanation: "Son destek ve hızlı ortalama çevresindeki geri çekilmeyi bekler.",
        entry: supportEntry,
        stop: Math.min(supportEntry - atr * 1.60, swingLow - atr * 0.10),
      },
      {
        id: "ema-retest",
        label: "EMA yeniden testi",
        explanation: "Hızlı ortalamaya kontrollü dönüşten sonra yapısal stop kullanır.",
        entry: emaEntry,
        stop: Math.min(emaEntry - atr * 1.70, finite(latest.slow, emaEntry - atr * 1.55) - atr * 0.08),
      },
      {
        id: "atr-balanced",
        label: "ATR dengeli plan",
        explanation: "Kırılım veya dönüş stratejisinde sabitlenmiş volatilite riski uygular.",
        entry: balancedEntry,
        stop: balancedEntry - atr * 2.05,
      },
    ];
    return definitions
      .map((definition) => buildBistOrderCandidate(rows, latest, definition, definition.id === preferredId))
      .sort((a, b) => Number(b.valid) - Number(a.valid) || Number(b.preferred) - Number(a.preferred) || b.quality - a.quality);
  }

  function buildOrderPlan(rows, latest, strategyId = "trend") {
    const alternatives = buildOrderPlans(rows, latest, strategyId);
    const selected = alternatives[0];
    return { ...selected, alternatives, validPlanCount: alternatives.filter((plan) => plan.valid).length };
  }

  function parseIsYatirimRows(payload) {
    const values = Array.isArray(payload) ? payload : Array.isArray(payload?.value) ? payload.value : [];
    const normalized = values.map((item) => {
      const close = parseNumber(item.HGDG_KAPANIS ?? item.close);
      const average = parseNumber(item.HGDG_AOF ?? item.average, close);
      const high = parseNumber(item.HGDG_MAX ?? item.high, Math.max(close, average));
      const low = parseNumber(item.HGDG_MIN ?? item.low, Math.min(close, average));
      const timestamp = parseDate(item.HGDG_TARIH ?? item.date ?? item.time);
      return {
        timestamp,
        time: Number.isFinite(timestamp) ? new Date(timestamp).toISOString().slice(0, 10) : "",
        open: parseNumber(item.HGDG_ACILIS ?? item.open, average),
        high,
        low,
        close,
        volume: parseNumber(item.HGDG_HACIM ?? item.volume, 0),
      };
    }).filter((row) => Number.isFinite(row.timestamp) && [row.open, row.high, row.low, row.close].every(Number.isFinite) && row.close > 0 && row.high >= row.low);
    normalized.sort((a, b) => a.timestamp - b.timestamp);
    return normalized.filter((row, index) => index === normalized.length - 1 || row.timestamp !== normalized[index + 1].timestamp);
  }

  function textFromHtml(value) {
    return String(value ?? "")
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;|&#160;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/\s+/g, " ")
      .trim();
  }

  function extractCsvTable(html, csvName) {
    const escaped = csvName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`<table\\b[^>]*data-csvname=["']${escaped}["'][^>]*>([\\s\\S]*?)<\\/table>`, "i");
    return String(html || "").match(pattern)?.[1] || "";
  }

  function tableRows(tableHtml) {
    return [...String(tableHtml || "").matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) => ({
      html: match[1],
      cells: [...match[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => textFromHtml(cell[1])),
    })).filter((row) => row.cells.length);
  }

  function median(values) {
    const sorted = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
    if (!sorted.length) return NaN;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function sectorScoringProfile(sector) {
    const normalized = String(sector || "Diğer").toLocaleLowerCase("tr-TR");
    if (/banka|finans|sigorta|faktoring|leasing/.test(normalized)) {
      return { id: "financial", label: "Banka / finans değerlemesi", weights: { pe: 35, priceToBook: 65 } };
    }
    if (/holding|yatırım ortaklığı|girişim sermayesi/.test(normalized)) {
      return { id: "holding", label: "Holding / yatırım değerlemesi", weights: { pe: 25, evEbitda: 10, evSales: 20, priceToBook: 45 } };
    }
    if (/gayrimenkul|gmyo/.test(normalized)) {
      return { id: "real-estate", label: "Gayrimenkul değerlemesi", weights: { pe: 20, evSales: 20, priceToBook: 60 } };
    }
    if (/teknoloji|yazılım|perakende|hizmet|iletişim|telekom/.test(normalized)) {
      return { id: "growth-service", label: "Büyüme / hizmet değerlemesi", weights: { pe: 15, evEbitda: 25, evSales: 40, priceToBook: 20 } };
    }
    return { id: "industrial", label: "Sanayi değerlemesi", weights: { pe: 25, evEbitda: 40, evSales: 15, priceToBook: 20 } };
  }

  function parseFundamentalsHtml(html) {
    const summaries = new Map();
    const ratios = new Map();
    for (const row of tableRows(extractCsvTable(html, "temelozet"))) {
      const symbol = row.html.match(/[?&]hisse=([A-Z0-9]{3,6})/i)?.[1]?.toUpperCase();
      if (!symbol || row.cells.length < 8) continue;
      summaries.set(symbol, {
        name: row.cells[1],
        sector: row.cells[2] || "Diğer",
        close: parseNumber(row.cells[3]),
        marketCapTryM: parseNumber(row.cells[4]),
        marketCapUsdM: parseNumber(row.cells[5]),
        freeFloatPct: parseNumber(row.cells[6]),
        capitalM: parseNumber(row.cells[7]),
      });
    }
    for (const row of tableRows(extractCsvTable(html, "temelfinansal"))) {
      const symbol = row.html.match(/[?&]hisse=([A-Z0-9]{3,6})/i)?.[1]?.toUpperCase();
      if (!symbol || row.cells.length < 7) continue;
      ratios.set(symbol, {
        close: parseNumber(row.cells[1]),
        pe: parseNumber(row.cells[2]),
        evEbitda: parseNumber(row.cells[3]),
        evSales: parseNumber(row.cells[4]),
        priceToBook: parseNumber(row.cells[5]),
        period: row.cells[6] || "—",
      });
    }
    const allSymbols = new Set([...summaries.keys(), ...ratios.keys()]);
    const sectorValues = new Map();
    for (const symbol of allSymbols) {
      const sector = summaries.get(symbol)?.sector || "Diğer";
      if (!sectorValues.has(sector)) sectorValues.set(sector, { pe: [], evEbitda: [], evSales: [], priceToBook: [] });
      const ratio = ratios.get(symbol) || {};
      for (const key of ["pe", "evEbitda", "evSales", "priceToBook"]) if (Number.isFinite(ratio[key]) && ratio[key] > 0) sectorValues.get(sector)[key].push(ratio[key]);
    }
    const result = new Map();
    for (const symbol of allSymbols) {
      const summary = summaries.get(symbol) || {};
      const ratio = ratios.get(symbol) || {};
      const peers = sectorValues.get(summary.sector || "Diğer") || {};
      const scoringProfile = sectorScoringProfile(summary.sector || "Diğer");
      const weights = scoringProfile.weights;
      let earned = 0;
      let possible = 0;
      const peerMedians = {};
      for (const [key, weight] of Object.entries(weights)) {
        const value = ratio[key];
        if (!Number.isFinite(value)) continue;
        possible += weight;
        const peerMedian = median(peers[key] || []);
        peerMedians[key] = peerMedian;
        if (value <= 0) continue;
        if (!Number.isFinite(peerMedian) || peerMedian <= 0) earned += weight * 0.5;
        else if (value <= peerMedian) earned += weight;
        else if (value <= peerMedian * 1.35) earned += weight * 0.65;
        else if (value <= peerMedian * 1.8) earned += weight * 0.3;
      }
      const score = possible >= 25 ? clamp(earned / possible * 100, 0, 100) : 50;
      result.set(symbol, {
        available: Boolean(summaries.has(symbol) || ratios.has(symbol)),
        score,
        status: score >= 65 ? "Güçlü" : score >= 45 ? "Dengeli" : "Zayıf",
        scoringModel: scoringProfile.label,
        scoringProfile: scoringProfile.id,
        scoringWeights: weights,
        peerMedians,
        ...summary,
        ...ratio,
      });
    }
    return result;
  }

  function absoluteKapUrl(path) {
    try { return new URL(path, "https://kap.org.tr").toString(); }
    catch { return KAP_DIRECTORY_PAGE; }
  }

  function parseKapDirectoryHtml(html) {
    const companies = new Map();
    for (const match of String(html || "").matchAll(/<a\b[^>]*href=["']([^"']*\/tr\/sirket-bilgileri\/(?:ozet|genel)\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      const label = textFromHtml(match[2]).toUpperCase();
      const symbol = label.match(/\b[A-Z0-9]{3,6}\b/)?.[0];
      if (symbol && !companies.has(symbol)) companies.set(symbol, { symbol, url: absoluteKapUrl(match[1]), label });
    }
    return companies;
  }

  function parseKapMemberId(html) {
    const text = String(html || "");
    return text.match(/[?&]member=([a-f0-9]{20,})/i)?.[1]
      || text.match(/\/tr\/sirket-bilgileri\/(?:ozet|genel)\/([a-f0-9]{20,})/i)?.[1]
      || text.match(/["']member(?:Oid|Id)?["']\s*:\s*["']([a-f0-9]{20,})/i)?.[1]
      || text.match(/data-member(?:-oid|-id)?=["']([a-f0-9]{20,})/i)?.[1]
      || null;
  }

  function localDateToIso(value) {
    const match = String(value || "").match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
    if (!match) return null;
    return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  }

  function parseKapDisclosuresHtml(html, symbol, now = new Date()) {
    const events = [];
    const normalizedSymbol = String(symbol || "").toUpperCase();
    for (const rowMatch of String(html || "").matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const text = textFromHtml(rowMatch[1]);
      if (!text || !new RegExp(`\\b${normalizedSymbol}\\b`, "i").test(text)) continue;
      const date = localDateToIso(text);
      if (!date) continue;
      const riskLabels = KAP_RISK_TERMS.filter((term) => term.pattern.test(text)).map((term) => term.label);
      events.push({ date, text: text.slice(0, 360), riskLabels });
    }
    events.sort((a, b) => b.date.localeCompare(a.date));
    const recentRisks = events
      .filter((event) => businessDaysAge(event.date, now) <= 7 && event.riskLabels.length)
      .flatMap((event) => event.riskLabels.map((label) => ({ label, date: event.date, text: event.text })))
      .filter((event, index, all) => all.findIndex((candidate) => candidate.label === event.label && candidate.date === event.date) === index);
    return {
      available: events.length > 0,
      blocked: recentRisks.length > 0,
      status: !events.length ? "Doğrulanamadı" : recentRisks.length ? "İnceleme gerekli" : "Yakın risk işareti yok",
      lastDisclosureDate: events[0]?.date || null,
      recentEventCount: events.filter((event) => businessDaysAge(event.date, now) <= 7).length,
      recentRisks: recentRisks.slice(0, 5),
      latestEvents: events.slice(0, 3).map((event) => ({ date: event.date, text: event.text })),
    };
  }

  function collectKapStrings(value, depth = 0) {
    if (depth > 5 || value == null) return [];
    if (typeof value === "string" || typeof value === "number") return [String(value)];
    if (Array.isArray(value)) return value.flatMap((item) => collectKapStrings(item, depth + 1));
    if (typeof value === "object") return Object.values(value).flatMap((item) => collectKapStrings(item, depth + 1));
    return [];
  }

  function kapEventDate(value) {
    const timestamp = parseDate(value);
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString().slice(0, 10) : localDateToIso(value);
  }

  function kapFeedValues(payload) {
    return Array.isArray(payload) ? payload : Array.isArray(payload?.disclosures) ? payload.disclosures : Array.isArray(payload?.data) ? payload.data : [];
  }

  function parseKapDisclosureFeed(payload, now = new Date()) {
    const values = kapFeedValues(payload);
    const bySymbol = new Map();
    const events = [];
    for (const item of values) {
      const basic = item?.basic || item || {};
      const strings = collectKapStrings(basic);
      const text = strings.join(" ").replace(/\s+/g, " ").trim();
      const date = kapEventDate(basic.publishDate ?? basic.disclosureDate ?? basic.date ?? basic.createdAt ?? text);
      if (!date || !text) continue;
      const explicitStockText = collectKapStrings(basic.stockCodes ?? basic.relatedStocks ?? basic.stockCode ?? basic.company?.stockCodes).join(" ").toUpperCase();
      const symbols = [...new Set((explicitStockText.match(/\b[A-Z][A-Z0-9]{2,5}\b/g) || []).filter((symbol) => !["BIST", "KAP", "TRY", "USD", "EUR"].includes(symbol)))];
      const riskLabels = KAP_RISK_TERMS.filter((term) => term.pattern.test(text)).map((term) => term.label);
      const event = {
        date,
        text: text.slice(0, 480),
        symbols,
        riskLabels,
        disclosureIndex: basic.disclosureIndex ?? item?.disclosureIndex ?? null,
      };
      events.push(event);
      for (const symbol of symbols) {
        if (!bySymbol.has(symbol)) bySymbol.set(symbol, []);
        bySymbol.get(symbol).push(event);
      }
    }
    events.sort((a, b) => b.date.localeCompare(a.date));
    for (const symbolEvents of bySymbol.values()) symbolEvents.sort((a, b) => b.date.localeCompare(a.date));
    const lastDisclosureDate = events[0]?.date || null;
    const feedFresh = Boolean(lastDisclosureDate) && businessDaysAge(lastDisclosureDate, now) <= 2;
    const oldestDisclosureDate = events.at(-1)?.date || null;
    return { available: events.length > 0 && feedFresh, feedFresh, lastDisclosureDate, oldestDisclosureDate, coverageBusinessDays: oldestDisclosureDate ? businessDaysAge(oldestDisclosureDate, now) : 0, events, bySymbol };
  }

  function kapRiskFromFeed(feed, symbol, now = new Date()) {
    if (!feed?.available) return { available: false, blocked: true, status: "KAP güncel akışı doğrulanamadı", lastDisclosureDate: feed?.lastDisclosureDate || null, searchUrl: KAP_DISCLOSURE_SEARCH };
    const events = feed.bySymbol?.get(symbol) || [];
    const recentEvents = events.filter((event) => businessDaysAge(event.date, now) <= 7);
    const recentRisks = recentEvents.flatMap((event) => event.riskLabels.map((label) => ({ label, date: event.date, text: event.text })))
      .filter((event, index, all) => all.findIndex((candidate) => candidate.label === event.label && candidate.date === event.date) === index);
    return {
      available: true,
      blocked: recentRisks.length > 0,
      status: recentRisks.length ? "İnceleme gerekli" : "Güncel KAP akışında yakın risk yok",
      coverage: "public-feed",
      lastDisclosureDate: events[0]?.date || feed.lastDisclosureDate,
      feedLastDisclosureDate: feed.lastDisclosureDate,
      recentEventCount: recentEvents.length,
      recentRisks: recentRisks.slice(0, 5),
      latestEvents: events.slice(0, 3).map((event) => ({ date: event.date, text: event.text })),
      searchUrl: `${KAP_DISCLOSURE_SEARCH}?stockCode=${encodeURIComponent(symbol)}`,
    };
  }

  async function fetchKapDisclosureFeed(fetcher = fetch, now = new Date()) {
    const collected = [];
    const seen = new Set();
    let afterDisclosureIndex = null;
    let coverageComplete = false;
    for (let page = 0; page < 24; page += 1) {
      const url = afterDisclosureIndex == null ? KAP_PUBLIC_FEED : `${KAP_PUBLIC_FEED}?afterDisclosureIndex=${encodeURIComponent(afterDisclosureIndex)}`;
      const response = await fetcher(url, { cache: "no-store", headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`KAP güncel bildirim akışı alınamadı (${response.status})`);
      const values = kapFeedValues(await response.json());
      if (!values.length) break;
      for (const item of values) {
        const index = item?.basic?.disclosureIndex ?? item?.disclosureIndex;
        const key = index == null ? JSON.stringify(item).slice(0, 500) : String(index);
        if (!seen.has(key)) { seen.add(key); collected.push(item); }
      }
      const pageFeed = parseKapDisclosureFeed(values, now);
      if (pageFeed.oldestDisclosureDate && businessDaysAge(pageFeed.oldestDisclosureDate, now) > 7) { coverageComplete = true; break; }
      const nextIndex = values.at(-1)?.basic?.disclosureIndex ?? values.at(-1)?.disclosureIndex;
      if (nextIndex == null || String(nextIndex) === String(afterDisclosureIndex)) break;
      afterDisclosureIndex = nextIndex;
    }
    const feed = { ...parseKapDisclosureFeed(collected, now), coverageComplete };
    if (!feed.events.length) throw new Error("KAP güncel bildirim akışı boş döndü");
    if (!feed.feedFresh) throw new Error(`KAP güncel bildirim akışı eski (${feed.lastDisclosureDate || "tarih yok"})`);
    if (!feed.coverageComplete) throw new Error(`KAP akışında 7 iş günlük kapsam tamamlanamadı (${feed.coverageBusinessDays.toFixed(0)} iş günü)`);
    return feed;
  }

  async function fetchKapDirectory(fetcher = fetch) {
    const response = await fetcher(KAP_DIRECTORY_PAGE, { cache: "no-store", headers: { Accept: "text/html" } });
    if (!response.ok) throw new Error(`KAP şirket listesi alınamadı (${response.status})`);
    const directory = parseKapDirectoryHtml(await response.text());
    if (directory.size < 100) throw new Error(`KAP şirket listesi eksik (${directory.size} şirket)`);
    return directory;
  }

  async function fetchKapRisk(symbol, directory, options = {}) {
    const fetcher = options.fetcher || fetch;
    const company = directory?.get(symbol);
    if (!company?.url) return { available: false, blocked: true, status: "KAP şirketi eşleşmedi", searchUrl: KAP_DISCLOSURE_SEARCH };
    const companyResponse = await fetcher(company.url, { cache: "no-store", headers: { Accept: "text/html" } });
    if (!companyResponse.ok) throw new Error(`${symbol}: KAP şirket sayfası alınamadı (${companyResponse.status})`);
    const companyHtml = await companyResponse.text();
    const memberId = parseKapMemberId(companyHtml);
    let result = parseKapDisclosuresHtml(companyHtml, symbol, options.now || new Date());
    let searchUrl = company.url;
    if (memberId) {
      searchUrl = `https://kap.org.tr/tr/bildirim-sorgu-sonuc?member=${encodeURIComponent(memberId)}`;
      const disclosureResponse = await fetcher(searchUrl, { cache: "no-store", headers: { Accept: "text/html" } });
      if (!disclosureResponse.ok) throw new Error(`${symbol}: KAP bildirimleri alınamadı (${disclosureResponse.status})`);
      result = parseKapDisclosuresHtml(await disclosureResponse.text(), symbol, options.now || new Date());
    }
    return { ...result, companyUrl: company.url, searchUrl, memberResolved: Boolean(memberId) };
  }

  async function fetchFundamentals(fetcher = fetch) {
    const response = await fetcher(FUNDAMENTALS_PAGE, { cache: "no-store", headers: { Accept: "text/html" } });
    if (!response.ok) throw new Error(`temel değerler alınamadı (${response.status})`);
    const result = parseFundamentalsHtml(await response.text());
    if (result.size < 100) throw new Error(`temel değerler tablosu eksik (${result.size} hisse)`);
    return result;
  }

  async function fetchUniverse(fetcher = fetch) {
    try {
      const response = await fetcher(BIST_INDEX_CSV, { cache: "no-store" });
      if (!response.ok) throw new Error(`BIST liste hatası: ${response.status}`);
      const text = await response.text();
      const symbols = new Set();
      for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.toUpperCase();
        if (!line.includes("XU030") && !line.includes("BIST 30")) continue;
        const cells = line.split(/[;,\t]/).map((cell) => cell.replace(/["']/g, "").trim());
        const symbol = cells.find((cell) => /^[A-Z0-9]{3,6}$/.test(cell) && !cell.startsWith("XU"));
        if (symbol) symbols.add(symbol);
      }
      if (symbols.size >= 20) return { symbols: [...symbols].slice(0, 40), source: "Borsa İstanbul BIST 30" };
    } catch {
      // The official CSV can be temporarily unavailable; use the liquid fallback universe.
    }
    return { symbols: [...FALLBACK_UNIVERSE], source: "FinPilot likit BIST havuzu" };
  }

  function selectBistUniverse(fundamentals, officialSymbols = [], limit = PROFILE.universeLimit) {
    const official = new Set((officialSymbols || []).map((symbol) => String(symbol).toUpperCase()));
    const candidates = [...(fundamentals instanceof Map ? fundamentals.entries() : [])].map(([symbol, value]) => {
      const marketCap = finite(value?.marketCapTryM, NaN);
      const freeFloat = finite(value?.freeFloatPct, NaN);
      return {
        symbol: String(symbol).toUpperCase(),
        marketCap,
        freeFloat,
        liquidCap: Number.isFinite(marketCap) && Number.isFinite(freeFloat) ? marketCap * freeFloat / 100 : 0,
        official: official.has(String(symbol).toUpperCase()),
      };
    }).filter((item) => /^[A-Z][A-Z0-9]{2,5}$/.test(item.symbol) && item.marketCap > 0 && item.freeFloat >= 5);
    candidates.sort((a, b) => Number(b.official) - Number(a.official) || b.liquidCap - a.liquidCap || b.marketCap - a.marketCap || a.symbol.localeCompare(b.symbol));
    return candidates.slice(0, Math.max(30, Math.floor(finite(limit, PROFILE.universeLimit)))).map((item) => item.symbol);
  }

  async function fetchHistory(symbol, options = {}) {
    const fetcher = options.fetcher || fetch;
    const end = options.endDate ? new Date(options.endDate) : new Date();
    const start = options.startDate ? new Date(options.startDate) : new Date(end.getTime() - 760 * 86400000);
    const url = `${HISTORY_ENDPOINT}?hisse=${encodeURIComponent(symbol)}&startdate=${formatDate(start)}&enddate=${formatDate(end)}`;
    const response = await fetcher(url, { cache: "no-store", headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`${symbol}: veri alınamadı (${response.status})`);
    const payload = await response.json();
    const rows = parseIsYatirimRows(payload);
    if (rows.length < 180) throw new Error(`${symbol}: yalnızca ${rows.length} günlük veri bulundu`);
    return rows;
  }

  function scoreAnalysis(analysis, fundamental) {
    const backtest = analysis.backtest;
    const fiveDay = analysis.forecasts?.find((forecast) => forecast.horizon === 5);
    const profitFactorScore = Number.isFinite(backtest.profitFactor) ? clamp(backtest.profitFactor * 38, 0, 100) : 100;
    const expectancyScore = clamp(50 + backtest.expectancyR * 35, 0, 100);
    const modelScore = analysis.model.available ? analysis.model.probabilityUp : 50;
    const directionScore = fiveDay?.available ? fiveDay.probabilityUp : 0;
    const fundamentalScore = fundamental?.available ? fundamental.score : 50;
    const watchEdge = backtest.totalTrades >= PROFILE.minimumTrades && backtest.profitFactor >= 1.15 && backtest.expectancyR > 0;
    const backtestEdge = watchEdge && backtest.profitFactor >= PROFILE.minimumProfitFactor && backtest.expectancyR >= PROFILE.minimumExpectancyR;
    const modelEdge = analysis.model.available && analysis.model.probabilityUp >= PROFILE.minimumModelProbability && analysis.model.outOfSampleAccuracy >= 48 && analysis.model.brierScore <= PROFILE.maximumBrierScore;
    const fundamentalEdge = Boolean(fundamental?.available) && fundamental.score >= 38;
    const directionEdge = Boolean(fiveDay?.available) && fiveDay.probabilityUp >= PROFILE.minimumDirectionProbability && fiveDay.probabilityDown <= PROFILE.maximumDirectionDownProbability && fiveDay.expectedMedianPct > 0;
    const recentEdge = backtest.recentTrades >= 6 && backtest.recentExpectancyR > 0 && backtest.recentProfitFactor >= 1;
    const stressEdge = Boolean(backtest.stress?.available) && backtest.stress.profitablePct >= PROFILE.minimumStressProfitability;
    const edge = backtestEdge && modelEdge && fundamentalEdge && directionEdge && recentEdge && stressEdge;
    let score = analysis.setupScore * 0.24 + analysis.estimatedProbability * 0.16 + profitFactorScore * 0.13 + expectancyScore * 0.09 + modelScore * 0.11 + fundamentalScore * 0.11 + directionScore * 0.16;
    if (analysis.decision === "LONG ADAYI") score += 10;
    else if (!watchEdge) score -= 18;
    return { score: clamp(score, 0, 100), edge, watchEdge, backtestEdge, modelEdge, fundamentalEdge, directionEdge, recentEdge, stressEdge };
  }

  function buildRecommendation(symbol, rows, analysis, fundamental, options = {}) {
    const latest = analysis.latest;
    const evaluation = scoreAnalysis(analysis, fundamental);
    const orderPlan = buildOrderPlan(rows, latest, analysis.strategy?.mode);
    const dataDate = rows[rows.length - 1].time;
    const dataAgeBusinessDays = businessDaysAge(dataDate, options.now || new Date());
    const dataFresh = dataAgeBusinessDays <= PROFILE.maximumDataAgeBusinessDays;
    const preEligible = analysis.decision === "LONG ADAYI" && evaluation.edge && orderPlan.valid && dataFresh;
    const probabilityAvailable = analysis.backtest.totalTrades >= PROFILE.minimumTrades;
    const trendAgent = analysis.agents.find((agent) => agent.name === "Trend Ajanı");
    const momentumAgent = analysis.agents.find((agent) => agent.name === "Momentum Ajanı");
    const forecasts = Object.fromEntries((analysis.forecasts || []).map((forecast) => [String(forecast.horizon), forecast]));
    const fiveDay = forecasts["5"];
    const pfText = Number.isFinite(analysis.backtest.profitFactor) ? analysis.backtest.profitFactor.toFixed(2) : "∞";
    const gateDiagnostics = {
      setup: {
        passed: analysis.decision === "LONG ADAYI",
        label: "Kurulum",
        message: `${analysis.strategy?.label || "Strateji"}: ${analysis.setupScore.toFixed(0)}/${finite(analysis.strategy?.threshold, PROFILE.threshold).toFixed(0)}; rejim ${analysis.strategy?.regime ? "uygun" : "uygun değil"}.`,
      },
      backtest: {
        passed: evaluation.backtestEdge,
        label: "Backtest",
        message: `${analysis.backtest.totalTrades}/${PROFILE.minimumTrades} işlem · PF ${pfText}/${PROFILE.minimumProfitFactor.toFixed(2)} · beklenti ${analysis.backtest.expectancyR.toFixed(2)}R/${PROFILE.minimumExpectancyR.toFixed(2)}R.`,
      },
      model: {
        passed: evaluation.modelEdge,
        label: "ML",
        message: analysis.model.available ? `Yükseliş %${analysis.model.probabilityUp.toFixed(1)}/%${PROFILE.minimumModelProbability} · doğruluk %${analysis.model.outOfSampleAccuracy.toFixed(1)}/%48 · Brier ${analysis.model.brierScore.toFixed(3)}/${PROFILE.maximumBrierScore.toFixed(2)} azami.` : "ML modeli için yeterli kronolojik örnek yok.",
      },
      fundamental: {
        passed: evaluation.fundamentalEdge,
        label: "Temel",
        message: fundamental?.available ? `${fundamental.scoringModel || "Sektör değerlemesi"}: ${fundamental.score.toFixed(0)}/38 gerekli.` : "Temel değerleme doğrulanamadı; fail-closed kapı kapalı.",
      },
      direction: {
        passed: evaluation.directionEdge,
        label: "Yön",
        message: fiveDay?.available ? `5 gün yükseliş %${fiveDay.probabilityUp.toFixed(1)}/%${PROFILE.minimumDirectionProbability} · düşüş %${fiveDay.probabilityDown.toFixed(1)}/%${PROFILE.maximumDirectionDownProbability} azami · medyan %${fiveDay.expectedMedianPct.toFixed(2)}.` : "5 günlük yön örneği yetersiz.",
      },
      recentRegime: {
        passed: evaluation.recentEdge,
        label: "Yakın dönem",
        message: `${analysis.backtest.recentTrades}/6 işlem · PF ${analysis.backtest.recentProfitFactor.toFixed(2)}/1.00 · beklenti ${analysis.backtest.recentExpectancyR.toFixed(2)}R/>0R.`,
      },
      stress: {
        passed: evaluation.stressEdge,
        label: "Stres",
        message: analysis.backtest.stress?.available ? `Pozitif senaryo %${analysis.backtest.stress.profitablePct.toFixed(1)}/%${PROFILE.minimumStressProfitability}.` : "Stres testi için en az 8 işlem gerekli.",
      },
      orderPlan: {
        passed: orderPlan.valid,
        label: "Emir planı",
        message: orderPlan.valid ? `${orderPlan.label}: 3 plandan ${orderPlan.validPlanCount} tanesi geçerli; risk ${orderPlan.riskAtr.toFixed(2)} ATR ve %${orderPlan.riskPct.toFixed(2)}.` : (orderPlan.failureReasons || ["Üç emir planı da risk sınırlarını geçemedi."]).join(" "),
      },
      dataFresh: {
        passed: dataFresh,
        label: "Tazelik",
        message: `Veri yaşı ${dataAgeBusinessDays} iş günü; azami ${PROFILE.maximumDataAgeBusinessDays}.`,
      },
      kap: { passed: false, label: "KAP", message: "KAP derin kontrolü bekleniyor." },
      market: { passed: false, label: "Piyasa", message: "Piyasa genişliği tarama sonunda hesaplanacak." },
    };
    return {
      market: "bist",
      marketLabel: "BIST",
      assetType: "HİSSE",
      symbol,
      displaySymbol: symbol,
      action: "YATIRMA",
      eligible: false,
      preEligible,
      rankScore: evaluation.score,
      setupScore: analysis.setupScore,
      trendDirection: latest.trend,
      price: latest.close,
      priceDecimals: 2,
      dataDate,
      dataAgeBusinessDays,
      dataFresh,
      atrPct: latest.atrPct,
      volumeRatio: latest.volumeRatio,
      historicalProbability: probabilityAvailable ? analysis.backtest.smoothedWinProbability : null,
      probabilityLow: probabilityAvailable ? analysis.backtest.confidenceLow : null,
      probabilityHigh: probabilityAvailable ? analysis.backtest.confidenceHigh : null,
      profitFactor: analysis.backtest.profitFactor,
      expectancyR: analysis.backtest.expectancyR,
      totalTrades: analysis.backtest.totalTrades,
      maxDrawdownR: analysis.backtest.maxDrawdownR,
      recentExpectancyR: analysis.backtest.recentExpectancyR,
      recentProfitFactor: analysis.backtest.recentProfitFactor,
      stress: analysis.backtest.stress,
      modelProbabilityUp: analysis.model.available ? analysis.model.probabilityUp : null,
      modelAccuracy: analysis.model.available ? analysis.model.outOfSampleAccuracy : null,
      fundamental: fundamental?.available ? fundamental : { available: false, score: 50, status: "Veri yok" },
      kap: { available: false, blocked: true, status: "KAP araştırması bekleniyor" },
      forecasts,
      forecastDisplay: [
        { key: "1", label: "1 GÜN" },
        { key: "5", label: "5 GÜN" },
        { key: "20", label: "20 GÜN" },
      ],
      direction: fiveDay?.available ? fiveDay.direction : "BELİRSİZ",
      confidence: analysis.probabilityLabel,
      strategy: {
        id: analysis.strategy?.mode || "trend",
        label: analysis.strategy?.label || "Trend devamı",
        threshold: analysis.strategy?.threshold,
        score: analysis.strategy?.score,
        selectionScore: analysis.selectionScore,
        comparisons: analysis.strategyComparisons || [],
      },
      orderPlan,
      levels: {
        watchLow: orderPlan.limitBuy,
        watchHigh: roundToTick(orderPlan.limitBuy + latest.atr * 0.18, "nearest"),
        limitBuy: orderPlan.limitBuy,
        stop: orderPlan.stopTrigger,
        stopTrigger: orderPlan.stopTrigger,
        stopLimit: orderPlan.stopLimit,
        target1: orderPlan.target1,
        target2: orderPlan.target2,
      },
      gates: {
        setup: analysis.decision === "LONG ADAYI",
        backtest: evaluation.backtestEdge,
        model: evaluation.modelEdge,
        fundamental: evaluation.fundamentalEdge,
        direction: evaluation.directionEdge,
        recentRegime: evaluation.recentEdge,
        stress: evaluation.stressEdge,
        orderPlan: orderPlan.valid,
        dataFresh,
        kap: false,
        market: false,
      },
      gateDiagnostics,
      reasons: [
        `Seçilen yaklaşım: ${analysis.strategy?.label || "Trend devamı"}; ${analysis.strategyComparisons?.length || 1} strateji aynı veri üzerinde ayrı backtest edildi.`,
        trendAgent?.detail || "Trend verisi hesaplandı.",
        momentumAgent?.detail || "Momentum verisi hesaplandı.",
        evaluation.watchEdge ? "Masraflar sonrası geçmiş test pozitif beklenti gösteriyor." : "Masraflar sonrası geçmiş test yeterli avantaj göstermiyor.",
        analysis.model.available ? `Yerel ML yükseliş olasılığı %${analysis.model.probabilityUp.toFixed(1)}; kronolojik test doğruluğu %${analysis.model.outOfSampleAccuracy.toFixed(1)}.` : "Yerel ML için veri yetersiz.",
        fiveDay?.available ? `5 işlem günü yön modeli: yükseliş %${fiveDay.probabilityUp.toFixed(1)}, düşüş %${fiveDay.probabilityDown.toFixed(1)}, yatay %${fiveDay.probabilityFlat.toFixed(1)}; beklenen orta hareket %${fiveDay.expectedMedianPct.toFixed(2)}.` : "5 günlük yön modeli için yeterli benzer dönem bulunamadı.",
        fundamental?.available ? `${fundamental.sector || "Sektör"}: ${fundamental.scoringModel || "sektör değerlemesi"} puanı ${fundamental.score.toFixed(0)}/100 (${fundamental.status}); F/K ${Number.isFinite(fundamental.pe) ? fundamental.pe.toFixed(1) : "—"}, PD/DD ${Number.isFinite(fundamental.priceToBook) ? fundamental.priceToBook.toFixed(1) : "—"}.` : "Temel değerleme tablosu alınamadı; sonuç yalnızca teknik, backtest ve ML kontrollerine dayanıyor.",
        analysis.backtest.stress?.available ? `Monte Carlo stres testi pozitif kapanış oranı %${analysis.backtest.stress.profitablePct.toFixed(1)}; kötü %10 senaryo ${analysis.backtest.stress.p10NetR.toFixed(2)}R.` : "Stres testi için işlem sayısı yetersiz.",
        orderPlan.valid ? `${orderPlan.label} seçildi; 3 plandan ${orderPlan.validPlanCount} tanesi sınırları geçti ve hedef 2 risk/getiri ${orderPlan.rewardRisk2.toFixed(2)}R.` : `Üç emir planı da geçemedi: ${(orderPlan.failureReasons || []).join(" ")}`,
        dataFresh ? `Fiyat verisi ${dataAgeBusinessDays} iş günü yaşında; tazelik kapısı açık.` : `Fiyat verisi ${dataAgeBusinessDays} iş günü yaşında; tazelik kapısı kapalı.`,
        evaluation.edge ? "Teknik, temel, ML, yön, yakın dönem ve stres kapıları birlikte geçti." : "Sıkı güvenlik kapılarının tamamı birlikte geçilmedi.",
      ],
      links: {
        isYatirim: `https://www.isyatirim.com.tr/tr-tr/analiz/hisse/Sayfalar/sirket-karti.aspx?hisse=${symbol}`,
        tradingView: `https://tr.tradingview.com/chart/?symbol=BIST%3A${symbol}`,
        kap: KAP_DISCLOSURE_SEARCH,
      },
    };
  }

  function finalizeRecommendation(item, kap, marketGateOpen, dataSufficient, marketContext = {}) {
    const kapResult = kap || { available: false, blocked: true, status: "KAP doğrulanamadı" };
    const kapGate = Boolean(kapResult.available) && !kapResult.blocked;
    const marketGate = Boolean(marketGateOpen) && Boolean(dataSufficient);
    const eligible = Boolean(item.preEligible) && kapGate && marketGate;
    const reasons = [...item.reasons];
    if (!kapResult.available) reasons.push("KAP bildirimleri doğrulanamadığı için güvenlik gereği YATIRMA.");
    else if (kapResult.blocked) reasons.push(`Son KAP bildirimlerinde inceleme gerektiren işaret bulundu: ${kapResult.recentRisks?.map((risk) => `${risk.label} (${risk.date})`).join(", ") || kapResult.status}.`);
    else reasons.push(`KAP kontrolü tamamlandı; son 7 iş gününde tanımlı risk işareti bulunmadı (${kapResult.recentEventCount || 0} bildirim incelendi).`);
    if (!marketGateOpen) reasons.push("Piyasa genişliği risk kapısı kapalı olduğu için YATIRMA.");
    if (!dataSufficient) reasons.push("Tarama kapsamı yetersiz olduğu için YATIRMA.");
    const gates = { ...item.gates, kap: kapGate, market: marketGate };
    const gateLabels = { setup: "Kurulum", backtest: "Backtest", model: "ML", fundamental: "Temel", direction: "Yön", recentRegime: "Yakın dönem", stress: "Stres", orderPlan: "Emir planı", dataFresh: "Tazelik", kap: "KAP", market: "Piyasa" };
    const gateDiagnostics = {
      ...(item.gateDiagnostics || {}),
      kap: {
        passed: kapGate,
        label: "KAP",
        message: !kapResult.available ? "KAP güncel akışı doğrulanamadı." : kapResult.blocked ? `KAP risk işareti: ${kapResult.recentRisks?.map((risk) => risk.label).join(", ") || kapResult.status}.` : `KAP açık: son 7 iş gününde tanımlı risk yok; ${kapResult.recentEventCount || 0} bildirim incelendi.`,
      },
      market: {
        passed: marketGate,
        label: "Piyasa",
        message: !dataSufficient ? `Tarama kapsamı %${finite(marketContext.coveragePct).toFixed(1)}/%70 gerekli.` : marketGateOpen ? `Pozitif trend genişliği %${finite(marketContext.breadthPct).toFixed(1)}; %35 kapısı açık.` : `Pozitif trend genişliği %${finite(marketContext.breadthPct).toFixed(1)}/%35 gerekli.`,
      },
    };
    const failedGates = Object.entries(gates).filter(([, passed]) => !passed).map(([key]) => ({ key, label: gateLabels[key] || key, message: gateDiagnostics[key]?.message || `${gateLabels[key] || key} kapısı geçilmedi.` }));
    return {
      ...item,
      action: eligible ? "YATIR" : "YATIRMA",
      eligible,
      nearMiss: !eligible && item.rankScore >= 55 && failedGates.length <= 3,
      failedGates,
      distanceToEligible: failedGates.length,
      kap: kapResult,
      gates,
      gateDiagnostics,
      reasons,
      links: { ...item.links, kap: kapResult.searchUrl || kapResult.companyUrl || KAP_DISCLOSURE_SEARCH },
    };
  }

  async function scanSymbols(symbols, options = {}) {
    const results = [];
    const errors = [];
    const queue = [...new Set(symbols.map((symbol) => String(symbol).trim().toUpperCase()).filter(Boolean))];
    let cursor = 0;
    let completed = 0;
    const worker = async () => {
      while (cursor < queue.length) {
        const index = cursor;
        cursor += 1;
        const symbol = queue[index];
        try {
          const rows = await fetchHistory(symbol, options);
          const suite = engine.analyzeStrategies(rows, { ...PROFILE, ...(options.profile || {}) });
          const analysis = { ...suite.selected, strategyComparisons: suite.strategies };
          results.push(buildRecommendation(symbol, rows, analysis, options.fundamentals?.get(symbol), options));
        } catch (error) {
          errors.push({ symbol, message: error instanceof Error ? error.message : String(error) });
        }
        completed += 1;
        options.onProgress?.({ completed, total: queue.length, symbol });
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker));
    results.sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.rankScore - a.rankScore);
    return { results, errors };
  }

  async function runScan(options = {}) {
    const fetcher = options.fetcher || fetch;
    const now = options.now instanceof Date ? options.now : options.now ? new Date(options.now) : new Date();
    const universePromise = options.symbols ? Promise.resolve({ symbols: options.symbols, source: "Özel tarama havuzu" }) : fetchUniverse(fetcher);
    const fundamentalsPromise = options.fundamentals ? Promise.resolve({ data: options.fundamentals, warning: null }) : fetchFundamentals(fetcher).then((data) => ({ data, warning: null })).catch((error) => ({ data: new Map(), warning: error instanceof Error ? error.message : String(error) }));
    const [baseUniverse, fundamentalResult] = await Promise.all([universePromise, fundamentalsPromise]);
    const expandedSymbols = !options.symbols && fundamentalResult.data.size >= 100
      ? selectBistUniverse(fundamentalResult.data, baseUniverse.symbols, options.universeLimit || PROFILE.universeLimit)
      : baseUniverse.symbols;
    const universe = {
      symbols: expandedSymbols.length ? expandedSymbols : baseUniverse.symbols,
      source: expandedSymbols.length > baseUniverse.symbols.length ? `İş Yatırım geniş likit BIST evreni · ${expandedSymbols.length}/${fundamentalResult.data.size}` : baseUniverse.source,
    };
    const scanned = await scanSymbols(universe.symbols, { ...options, now, fundamentals: fundamentalResult.data });
    const positiveTrendCount = scanned.results.filter((item) => item.trendDirection > 0).length;
    const marketBreadthPct = scanned.results.length ? positiveTrendCount / scanned.results.length * 100 : 0;
    const coveragePct = universe.symbols.length ? scanned.results.length / universe.symbols.length * 100 : 0;
    const dataSufficient = universe.symbols.length < 10 || coveragePct >= 70;
    const marketGateOpen = dataSufficient && (scanned.results.length < 10 || marketBreadthPct >= 35);
    const kapResults = new Map();
    const kapWarnings = [];
    if (options.kapRisks instanceof Map) {
      for (const item of scanned.results) if (options.kapRisks.has(item.symbol)) kapResults.set(item.symbol, options.kapRisks.get(item.symbol));
    } else {
      const prioritized = [
          ...scanned.results.filter((item) => item.preEligible),
          ...scanned.results,
        ].filter((item, index, all) => all.findIndex((candidate) => candidate.symbol === item.symbol) === index).slice(0, PROFILE.deepResearchLimit);
      try {
        const feed = options.kapFeed || await fetchKapDisclosureFeed(fetcher, now);
        for (const item of prioritized) kapResults.set(item.symbol, kapRiskFromFeed(feed, item.symbol, now));
      } catch (feedError) {
        kapWarnings.push({ symbol: "KAP AKIŞ", message: feedError instanceof Error ? feedError.message : String(feedError) });
        try {
          const directory = options.kapDirectory instanceof Map ? options.kapDirectory : await fetchKapDirectory(fetcher);
        let cursor = 0;
        const worker = async () => {
          while (cursor < prioritized.length) {
            const item = prioritized[cursor];
            cursor += 1;
            try { kapResults.set(item.symbol, await fetchKapRisk(item.symbol, directory, { fetcher, now })); }
            catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              kapResults.set(item.symbol, { available: false, blocked: true, status: "KAP doğrulanamadı", error: message });
              kapWarnings.push({ symbol: item.symbol, message });
            }
          }
        };
        await Promise.all(Array.from({ length: Math.min(3, prioritized.length) }, worker));
        } catch (error) {
          kapWarnings.push({ symbol: "KAP", message: error instanceof Error ? error.message : String(error) });
        }
      }
    }
    const recommendations = scanned.results.map((item) => finalizeRecommendation(
      item,
      kapResults.get(item.symbol) || { available: false, blocked: true, status: item.preEligible ? "KAP doğrulanamadı" : "Derin araştırmaya seçilmedi" },
      marketGateOpen,
      dataSufficient,
      { coveragePct, breadthPct: marketBreadthPct },
    )).sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.rankScore - a.rankScore);
    const candidates = recommendations.filter((item) => item.eligible);
    const latestDates = recommendations.map((item) => item.dataDate).filter(Boolean).sort();
    const warnings = [...(fundamentalResult.warning ? [{ symbol: "TEMEL VERİ", message: fundamentalResult.warning }] : []), ...kapWarnings];
    return {
      version: 4,
      market: "bist",
      mode: "fail-closed-recommendation",
      generatedAt: now.toISOString(),
      dataAsOf: latestDates.at(-1) || null,
      universe: universe.source,
      scannedCount: scanned.results.length,
      requestedCount: universe.symbols.length,
      errorCount: scanned.errors.length + warnings.length,
      candidateCount: candidates.length,
      marketDecision: candidates.length ? `YATIR · ${candidates.length} hisse tüm kapıları geçti` : !dataSufficient ? "YATIRMA · tarama verisi yetersiz" : marketGateOpen ? "YATIRMA · tüm koşulları geçen hisse yok" : "YATIRMA · piyasa filtresi zayıf",
      marketRegime: { gateOpen: marketGateOpen, dataSufficient, coveragePct, breadthPct: marketBreadthPct, positiveTrendCount, sampleSize: scanned.results.length },
      recommendations: recommendations.slice(0, 30),
      snapshot: recommendations.map((item) => ({ market: item.market, symbol: item.symbol, displaySymbol: item.displaySymbol, price: item.price, dataDate: item.dataDate, eligible: item.eligible })),
      errors: [...warnings, ...scanned.errors].slice(0, 8),
      research: {
        deepResearchLimit: PROFILE.deepResearchLimit,
        kapCheckedCount: [...kapResults.values()].filter((result) => result?.available).length,
        failClosed: true,
        horizons: [1, 5, 20],
      },
      source: {
        name: "İş Yatırım tarihsel fiyat bilgileri",
        url: "https://www.isyatirim.com.tr/tr-tr/analiz/hisse/Sayfalar/Tarihsel-Fiyat-Bilgileri.aspx",
        timing: "Gün sonu / gecikmeli veri",
      },
      fundamentalSource: {
        name: "İş Yatırım temel değerler ve oranlar",
        url: FUNDAMENTALS_PAGE,
      },
      kapSource: {
        name: "Kamuyu Aydınlatma Platformu",
        url: KAP_DISCLOSURE_SEARCH,
        timing: "Halka açık bildirim sayfaları; erişilemezse YATIR sinyali üretilmez",
      },
    };
  }

  return {
    PROFILE,
    FALLBACK_UNIVERSE,
    parseNumber,
    parseDate,
    parseIsYatirimRows,
    parseFundamentalsHtml,
    sectorScoringProfile,
    parseKapDirectoryHtml,
    parseKapMemberId,
    parseKapDisclosuresHtml,
    parseKapDisclosureFeed,
    kapRiskFromFeed,
    tickSizeForPrice,
    roundToTick,
    businessDaysAge,
    buildOrderPlan,
    buildOrderPlans,
    fetchFundamentals,
    fetchUniverse,
    fetchHistory,
    fetchKapDirectory,
    fetchKapDisclosureFeed,
    fetchKapRisk,
    selectBistUniverse,
    buildRecommendation,
    finalizeRecommendation,
    scanSymbols,
    runScan,
  };
});
