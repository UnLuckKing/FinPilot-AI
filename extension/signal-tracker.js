(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FinPilotSignalTracker = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MAX_RECORDS = 240;
  const OPEN_STATUSES = new Set(["EMİR BEKLİYOR", "AKTİF", "TAŞINAN STOP"]);
  const finite = (value, fallback = NaN) => Number.isFinite(Number(value)) ? Number(value) : fallback;

  function keyOf(item) {
    return `${item.market || "bist"}:${item.symbol}`;
  }

  function addEvent(record, status, at, detail) {
    return [...(record.eventLog || []), { status, at: at.toISOString(), detail }].slice(-20);
  }

  function parseExpiry(value) {
    const text = String(value || "");
    const parsed = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T23:59:59Z` : text);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function holdingExpiry(record) {
    if (!record.filledAt) return null;
    const opened = Date.parse(record.filledAt);
    if (!Number.isFinite(opened)) return null;
    return opened + (record.market === "crypto" ? 7 : 35) * 24 * 60 * 60 * 1000;
  }

  function compactSignal(item, now) {
    const plan = item.orderPlan || item.levels || {};
    const entry = finite(plan.limitBuy);
    const stop = finite(plan.stopTrigger ?? plan.stop);
    return {
      id: `${keyOf(item)}:${item.dataDate || now.toISOString()}`,
      key: keyOf(item),
      market: item.market || "bist",
      marketLabel: item.marketLabel || (item.market === "crypto" ? "KRİPTO" : "BIST"),
      symbol: item.symbol,
      displaySymbol: item.displaySymbol || item.symbol,
      sector: item.fundamental?.sector || (item.market === "crypto" ? "Kripto" : "Diğer"),
      strategyId: item.strategy?.id || "legacy",
      strategyLabel: item.strategy?.label || "Önceki sürüm",
      createdAt: now.toISOString(),
      openedAt: now.toISOString(),
      signalDataDate: item.dataDate || null,
      lastProcessedDataDate: item.dataDate || null,
      entry,
      fillPrice: null,
      originalStop: stop,
      currentStop: stop,
      stop,
      target1: finite(plan.target1),
      target2: finite(plan.target2),
      lastPrice: finite(item.price),
      lastUpdatedAt: now.toISOString(),
      validUntil: plan.validUntil || null,
      status: "EMİR BEKLİYOR",
      stage: "PENDING",
      remainingFraction: 1,
      realizedR: 0,
      resultR: null,
      evidenceGrade: item.evidenceGrade || item.validation?.evidenceGrade || null,
      predictedProbabilityUp: (item.validation?.calibratedProbability ?? item.calibratedProbabilityUp) == null ? null : finite(item.validation?.calibratedProbability ?? item.calibratedProbabilityUp, null),
      positionSizing: item.positionSizing ? { ...item.positionSizing } : null,
      quantity: finite(item.positionSizing?.quantity, 0),
      returnSignature: Array.isArray(item.returnSignature) ? item.returnSignature : [],
      eventLog: [{ status: "EMİR BEKLİYOR", at: now.toISOString(), detail: `Limit ${entry}; stop ${stop}.` }],
    };
  }

  function snapshotMap(result) {
    const map = new Map();
    for (const item of [...(result?.snapshot || []), ...(result?.recommendations || [])]) map.set(keyOf(item), item);
    return map;
  }

  function migrateRecord(record) {
    if (!record || typeof record !== "object") return record;
    if (record.status !== "AÇIK") return {
      ...record,
      createdAt: record.createdAt || record.openedAt,
      originalStop: finite(record.originalStop, finite(record.stop)),
      currentStop: finite(record.currentStop, finite(record.stop)),
      remainingFraction: finite(record.remainingFraction, 1),
      realizedR: finite(record.realizedR, 0),
      eventLog: Array.isArray(record.eventLog) ? record.eventLog : [],
    };
    return {
      ...record,
      createdAt: record.createdAt || record.openedAt,
      filledAt: record.filledAt || record.openedAt,
      fillPrice: finite(record.fillPrice, finite(record.entry)),
      originalStop: finite(record.originalStop, finite(record.stop)),
      currentStop: finite(record.currentStop, finite(record.stop)),
      remainingFraction: finite(record.remainingFraction, 1),
      realizedR: finite(record.realizedR, 0),
      status: "AKTİF",
      stage: "ACTIVE",
      eventLog: Array.isArray(record.eventLog) ? record.eventLog : [],
    };
  }

  function barOf(snapshot) {
    const price = finite(snapshot?.price);
    const bar = snapshot?.currentBar || {};
    return {
      open: finite(bar.open, price),
      high: finite(bar.high, price),
      low: finite(bar.low, price),
      close: finite(bar.close, price),
    };
  }

  function hasNewBar(record, snapshot) {
    if (!snapshot?.dataDate) return false;
    if (!record.lastProcessedDataDate) return true;
    const current = Date.parse(snapshot.dataDate);
    const previous = Date.parse(record.lastProcessedDataDate);
    if (Number.isFinite(current) && Number.isFinite(previous)) return current > previous;
    return String(snapshot.dataDate) !== String(record.lastProcessedDataDate);
  }

  function riskUnit(record) {
    return Math.max(Number.EPSILON, finite(record.fillPrice, record.entry) - finite(record.originalStop, record.stop));
  }

  function closeRecord(record, status, exitPrice, resultR, now, detail, extra = {}) {
    return {
      ...record,
      ...extra,
      status,
      stage: "CLOSED",
      closedAt: now.toISOString(),
      exitPrice,
      resultR,
      remainingFraction: 0,
      lastUpdatedAt: now.toISOString(),
      eventLog: addEvent(record, status, now, detail),
    };
  }

  function processActiveBar(record, bar, now) {
    const fill = finite(record.fillPrice, record.entry);
    const risk = riskUnit(record);
    const remaining = finite(record.remainingFraction, 1);
    const stop = finite(record.currentStop, record.originalStop);
    if (bar.low <= stop) {
      const exit = Math.min(stop, bar.open);
      const openR = (exit - fill) / risk;
      const totalR = finite(record.realizedR, 0) + remaining * openR;
      const outcome = record.stage === "TARGET1" ? "TAŞINAN STOP" : "STOP";
      return closeRecord(record, "STOP", exit, totalR, now, `${outcome}: ${exit}.`, { outcome });
    }
    if (bar.high >= record.target2) {
      const targetR = (record.target2 - fill) / risk;
      const totalR = finite(record.realizedR, 0) + remaining * targetR;
      return closeRecord(record, "HEDEF 2", record.target2, totalR, now, `İkinci hedef ${record.target2} görüldü.`, { outcome: "HEDEF 2" });
    }
    if (record.stage !== "TARGET1" && bar.high >= record.target1) {
      const firstTargetR = (record.target1 - fill) / risk;
      const realizedR = finite(record.realizedR, 0) + 0.5 * firstTargetR;
      const targetEvent = { ...record, eventLog: addEvent(record, "HEDEF 1", now, `Pozisyonun %50'si ${record.target1} seviyesinde kapandı.`) };
      return {
        ...targetEvent,
        status: "TAŞINAN STOP",
        stage: "TARGET1",
        currentStop: fill,
        remainingFraction: 0.5,
        realizedR,
        lastPrice: bar.close,
        lastUpdatedAt: now.toISOString(),
        eventLog: addEvent(targetEvent, "TAŞINAN STOP", now, `Kalan %50 için stop maliyet ${fill} seviyesine taşındı.`),
      };
    }
    return { ...record, lastPrice: bar.close, lastUpdatedAt: now.toISOString() };
  }

  function resolveRecord(input, snapshot, now) {
    let record = migrateRecord(input);
    if (!OPEN_STATUSES.has(record.status)) return record;
    const expiry = parseExpiry(record.validUntil);
    if (record.status === "EMİR BEKLİYOR" && Number.isFinite(expiry) && now.getTime() > expiry) {
      return closeRecord(record, "SÜRESİ DOLDU", finite(snapshot?.price, record.lastPrice), null, now, "Limit emri dolmadan geçerlilik süresi sona erdi.", { outcome: "EMİR SÜRESİ DOLDU", unfilled: true });
    }
    if (!snapshot) return record;
    const bar = barOf(snapshot);
    if (![bar.open, bar.high, bar.low, bar.close].every(Number.isFinite)) return record;
    let updated = { ...record, lastPrice: bar.close, lastUpdatedAt: now.toISOString() };
    if (!hasNewBar(updated, snapshot)) return updated;
    updated.lastProcessedDataDate = snapshot.dataDate;
    if (updated.status === "EMİR BEKLİYOR") {
      const touched = bar.low <= updated.entry;
      if (!touched) {
        if (snapshot.eligible === false) return closeRecord(updated, "KURULUM BOZULDU", bar.close, null, now, "Limit görülmeden araştırma kapılarından biri kapandı.", { outcome: "KURULUM BOZULDU", unfilled: true });
        return updated;
      }
      updated = {
        ...updated,
        status: "AKTİF",
        stage: "ACTIVE",
        filledAt: now.toISOString(),
        fillDataDate: snapshot.dataDate,
        fillPrice: updated.entry,
        lastPrice: bar.close,
        eventLog: addEvent(updated, "LİMİT DOLDU", now, `Limit ${updated.entry} sonraki kapanmış mumda görüldü; kâğıt pozisyon açıldı.`),
      };
      updated = { ...updated, eventLog: addEvent(updated, "AKTİF", now, "Stop ve hedef yaşam döngüsü başladı.") };
      return processActiveBar(updated, bar, now);
    }
    const maxHolding = holdingExpiry(updated);
    if (Number.isFinite(maxHolding) && now.getTime() > maxHolding) {
      const risk = riskUnit(updated);
      const remainingR = (bar.close - finite(updated.fillPrice, updated.entry)) / risk;
      const resultR = finite(updated.realizedR, 0) + finite(updated.remainingFraction, 1) * remainingR;
      return closeRecord(updated, "SÜRESİ DOLDU", bar.close, resultR, now, `Azami taşıma süresi sonunda ${bar.close} kapanışıyla izlendi.`, { outcome: "ZAMAN STOPU" });
    }
    return processActiveBar(updated, bar, now);
  }

  function isScored(record) {
    return !OPEN_STATUSES.has(record.status) && Number.isFinite(record.resultR);
  }

  function calculateStats(records) {
    const scored = records.filter(isScored);
    const wins = scored.filter((item) => item.resultR > 0).length;
    const losses = scored.filter((item) => item.resultR <= 0).length;
    const totalR = scored.reduce((sum, item) => sum + item.resultR, 0);
    const pending = records.filter((item) => item.status === "EMİR BEKLİYOR").length;
    const active = records.filter((item) => item.status === "AKTİF" || item.status === "TAŞINAN STOP").length;
    return {
      open: pending + active,
      pending,
      active,
      movedStop: records.filter((item) => item.status === "TAŞINAN STOP").length,
      expired: records.filter((item) => item.status === "SÜRESİ DOLDU" && item.unfilled).length,
      cancelled: records.filter((item) => item.status === "KURULUM BOZULDU").length,
      resolved: scored.length,
      wins,
      losses,
      winRate: scored.length ? wins / scored.length * 100 : null,
      averageR: scored.length ? totalR / scored.length : null,
      totalR,
    };
  }

  function updateHistory(previous, result, nowInput = new Date()) {
    const now = nowInput instanceof Date ? nowInput : new Date(nowInput);
    const existing = Array.isArray(previous?.records) ? previous.records.map(migrateRecord) : [];
    const snapshots = snapshotMap(result);
    let records = existing.map((record) => resolveRecord(record, snapshots.get(record.key), now));
    const activeKeys = new Set(records.filter((record) => OPEN_STATUSES.has(record.status)).map((record) => record.key));
    const seenIds = new Set(records.map((record) => record.id));
    for (const item of result?.recommendations || []) {
      if (!item.eligible || activeKeys.has(keyOf(item))) continue;
      const signal = compactSignal(item, now);
      if (!seenIds.has(signal.id) && [signal.entry, signal.originalStop, signal.target1, signal.target2].every(Number.isFinite) && signal.originalStop < signal.entry && signal.target1 > signal.entry && signal.target2 > signal.target1) {
        records.unshift(signal);
        activeKeys.add(signal.key);
        seenIds.add(signal.id);
      }
    }
    records = records.sort((a, b) => Date.parse(b.createdAt || b.openedAt) - Date.parse(a.createdAt || a.openedAt)).slice(0, MAX_RECORDS);
    return {
      version: 3,
      updatedAt: now.toISOString(),
      records,
      stats: calculateStats(records),
      assumptions: {
        fill: "Limit yalnız sinyalden sonraki yeni kapanmış mumda fiyat aralığına girdiyse dolmuş sayılır.",
        conflict: "Aynı mumda stop ve hedef görülürse stop önce kabul edilir.",
        partial: "Hedef 1'de %50 kâğıt çıkış; kalan stop maliyete taşınır.",
      },
      note: "Bu kayıtlar kapanmış mumlardan üretilen otomatik kâğıt işlemlerdir; aracı kurum emri veya gerçekleşme kanıtı değildir.",
    };
  }

  function performanceGuard(history, options = {}) {
    const minimumResolved = Math.max(5, Math.floor(finite(options.minimumResolved, 12)));
    const minimumWinRate = finite(options.minimumWinRate, 40);
    const minimumAverageR = finite(options.minimumAverageR, 0);
    const resolved = (history?.records || []).map(migrateRecord).filter(isScored);
    const groups = new Map();
    for (const record of resolved) {
      const key = `${record.market || "bist"}:${record.strategyId || "legacy"}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(record);
    }
    const summaries = {};
    for (const [key, records] of groups) {
      const wins = records.filter((record) => finite(record.resultR, 0) > 0).length;
      const totalR = records.reduce((sum, record) => sum + finite(record.resultR, 0), 0);
      const winRate = records.length ? wins / records.length * 100 : null;
      const averageR = records.length ? totalR / records.length : null;
      const ready = records.length >= minimumResolved;
      summaries[key] = {
        key,
        resolved: records.length,
        wins,
        winRate,
        averageR,
        ready,
        passed: !ready || (winRate >= minimumWinRate && averageR >= minimumAverageR),
      };
    }
    return { minimumResolved, minimumWinRate, minimumAverageR, summaries };
  }

  function applyPerformanceGuard(result, history, options = {}) {
    const guard = performanceGuard(history, options);
    const recommendations = (result?.recommendations || []).map((item) => {
      const key = `${item.market || result?.market || "bist"}:${item.strategy?.id || "legacy"}`;
      const summary = guard.summaries[key] || { resolved: 0, ready: false, passed: true, winRate: null, averageR: null };
      const message = !summary.ready
        ? `Koruma gözlemde: ${summary.resolved}/${guard.minimumResolved} sonuç; eşik dolana kadar karar engellenmez.`
        : `Kâğıt işlem geçmişi: kazanma %${summary.winRate.toFixed(1)}/%${guard.minimumWinRate} · ortalama ${summary.averageR.toFixed(2)}R/${guard.minimumAverageR.toFixed(2)}R.`;
      const gates = { ...(item.gates || {}), performance: summary.passed };
      const gateDiagnostics = { ...(item.gateDiagnostics || {}), performance: { passed: summary.passed, label: "Kâğıt performans", message } };
      if (summary.passed) return { ...item, gates, gateDiagnostics, performanceGuard: summary };
      const failedGates = [...(item.failedGates || []).filter((gate) => gate.key !== "performance"), { key: "performance", label: "Kâğıt performans", message }];
      return {
        ...item,
        action: "YATIRMA",
        eligible: false,
        preEligible: false,
        nearMiss: item.rankScore >= 55 && failedGates.length <= 3,
        distanceToEligible: failedGates.length,
        gates,
        gateDiagnostics,
        failedGates,
        performanceGuard: summary,
        reasons: [...(item.reasons || []), "Bu stratejinin otomatik kâğıt işlem sonuçları performans tabanının altına indi; yeni olumlu sinyal geçici olarak kilitlendi."],
      };
    });
    const candidateCount = recommendations.filter((item) => item.eligible).length;
    const market = result?.market || recommendations[0]?.market || "bist";
    const marketDecision = candidateCount === finite(result?.candidateCount, 0)
      ? result?.marketDecision
      : candidateCount > 0
        ? `YATIR · ${candidateCount} ${market === "crypto" ? "kripto" : "hisse"} kâğıt performans korumasını geçti`
        : "YATIRMA · kâğıt performans koruması yeni sinyali durdurdu";
    const snapshot = (result?.snapshot || []).map((snapshotItem) => {
      const current = recommendations.find((item) => keyOf(item) === keyOf(snapshotItem));
      return current ? { ...snapshotItem, eligible: current.eligible } : snapshotItem;
    });
    return {
      ...result,
      recommendations,
      snapshot,
      candidateCount,
      marketDecision,
      research: { ...(result?.research || {}), performanceGuard: guard },
    };
  }

  return { MAX_RECORDS, OPEN_STATUSES, keyOf, compactSignal, migrateRecord, resolveRecord, calculateStats, updateHistory, performanceGuard, applyPerformanceGuard };
});
