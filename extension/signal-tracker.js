(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FinPilotSignalTracker = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MAX_RECORDS = 200;
  const finite = (value, fallback = NaN) => Number.isFinite(Number(value)) ? Number(value) : fallback;

  function keyOf(item) {
    return `${item.market || "bist"}:${item.symbol}`;
  }

  function compactSignal(item, now) {
    const plan = item.orderPlan || item.levels || {};
    return {
      id: `${keyOf(item)}:${item.dataDate || now.toISOString()}`,
      key: keyOf(item),
      market: item.market || "bist",
      marketLabel: item.marketLabel || (item.market === "crypto" ? "KRİPTO" : "BIST"),
      symbol: item.symbol,
      displaySymbol: item.displaySymbol || item.symbol,
      strategyId: item.strategy?.id || "legacy",
      strategyLabel: item.strategy?.label || "Önceki sürüm",
      openedAt: now.toISOString(),
      signalDataDate: item.dataDate || null,
      entry: finite(plan.limitBuy),
      stop: finite(plan.stopTrigger ?? plan.stop),
      target1: finite(plan.target1),
      target2: finite(plan.target2),
      lastPrice: finite(item.price),
      lastUpdatedAt: now.toISOString(),
      validUntil: plan.validUntil || null,
      status: "AÇIK",
      resultR: null,
    };
  }

  function snapshotMap(result) {
    const map = new Map();
    for (const item of [...(result?.snapshot || []), ...(result?.recommendations || [])]) map.set(keyOf(item), item);
    return map;
  }

  function resolveRecord(record, snapshot, now) {
    if (record.status !== "AÇIK" || !snapshot) return record;
    const price = finite(snapshot.price);
    if (!Number.isFinite(price)) return record;
    const risk = record.entry - record.stop;
    const updated = { ...record, lastPrice: price, lastUpdatedAt: now.toISOString() };
    if (Number.isFinite(record.stop) && price <= record.stop) return { ...updated, status: "STOP", closedAt: now.toISOString(), exitPrice: price, resultR: risk > 0 ? (price - record.entry) / risk : -1 };
    if (Number.isFinite(record.target2) && price >= record.target2) return { ...updated, status: "HEDEF 2", closedAt: now.toISOString(), exitPrice: price, resultR: risk > 0 ? (record.target2 - record.entry) / risk : 2.2 };
    if (Number.isFinite(record.target1) && price >= record.target1) return { ...updated, status: "HEDEF 1", closedAt: now.toISOString(), exitPrice: price, resultR: risk > 0 ? (record.target1 - record.entry) / risk : 1.5 };
    const validUntilText = String(record.validUntil || "");
    const validUntil = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(validUntilText) ? `${validUntilText}T23:59:59Z` : validUntilText);
    if (Number.isFinite(validUntil) && now.getTime() > validUntil) return { ...updated, status: "SÜRESİ DOLDU", closedAt: now.toISOString(), exitPrice: price, resultR: risk > 0 ? (price - record.entry) / risk : null };
    return updated;
  }

  function calculateStats(records) {
    const resolved = records.filter((item) => item.status !== "AÇIK" && item.status !== "SÜRESİ DOLDU");
    const wins = resolved.filter((item) => item.status === "HEDEF 1" || item.status === "HEDEF 2").length;
    const losses = resolved.filter((item) => item.status === "STOP").length;
    const totalR = resolved.reduce((sum, item) => sum + (Number.isFinite(item.resultR) ? item.resultR : 0), 0);
    return {
      open: records.filter((item) => item.status === "AÇIK").length,
      expired: records.filter((item) => item.status === "SÜRESİ DOLDU").length,
      resolved: resolved.length,
      wins,
      losses,
      winRate: resolved.length ? wins / resolved.length * 100 : null,
      totalR,
    };
  }

  function updateHistory(previous, result, nowInput = new Date()) {
    const now = nowInput instanceof Date ? nowInput : new Date(nowInput);
    const existing = Array.isArray(previous?.records) ? previous.records : [];
    const snapshots = snapshotMap(result);
    let records = existing.map((record) => resolveRecord(record, snapshots.get(record.key), now));
    const activeKeys = new Set(records.filter((record) => record.status === "AÇIK").map((record) => record.key));
    const seenIds = new Set(records.map((record) => record.id));
    for (const item of result?.recommendations || []) {
      if (!item.eligible || activeKeys.has(keyOf(item))) continue;
      const signal = compactSignal(item, now);
      if (!seenIds.has(signal.id) && [signal.entry, signal.stop, signal.target1, signal.target2].every(Number.isFinite) && signal.stop < signal.entry && signal.target1 > signal.entry) {
        records.unshift(signal);
        activeKeys.add(signal.key);
        seenIds.add(signal.id);
      }
    }
    records = records.sort((a, b) => Date.parse(b.openedAt) - Date.parse(a.openedAt)).slice(0, MAX_RECORDS);
    return { version: 1, updatedAt: now.toISOString(), records, stats: calculateStats(records), note: "Sonuçlar yalnızca tarama anlarındaki kapanmış fiyatlarla izlenir; gerçekleşen aracı kurum işlemi değildir." };
  }

  function performanceGuard(history, options = {}) {
    const minimumResolved = Math.max(5, Math.floor(finite(options.minimumResolved, 12)));
    const minimumWinRate = finite(options.minimumWinRate, 40);
    const minimumAverageR = finite(options.minimumAverageR, 0);
    const resolved = (history?.records || []).filter((record) => record.status === "STOP" || String(record.status || "").startsWith("HEDEF"));
    const groups = new Map();
    for (const record of resolved) {
      const key = `${record.market || "bist"}:${record.strategyId || "legacy"}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(record);
    }
    const summaries = {};
    for (const [key, records] of groups) {
      const wins = records.filter((record) => String(record.status).startsWith("HEDEF")).length;
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
        : `Strateji geçmişi: kazanma %${summary.winRate.toFixed(1)}/%${guard.minimumWinRate} · ortalama ${summary.averageR.toFixed(2)}R/${guard.minimumAverageR.toFixed(2)}R.`;
      const gates = { ...(item.gates || {}), performance: summary.passed };
      const gateDiagnostics = { ...(item.gateDiagnostics || {}), performance: { passed: summary.passed, label: "Performans", message } };
      if (summary.passed) return { ...item, gates, gateDiagnostics, performanceGuard: summary };
      const failedGates = [...(item.failedGates || []).filter((gate) => gate.key !== "performance"), { key: "performance", label: "Performans", message }];
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
        reasons: [...(item.reasons || []), "Bu stratejinin izlenen sonuçları performans tabanının altına indi; yeni olumlu sinyal geçici olarak kilitlendi."],
      };
    });
    const candidateCount = recommendations.filter((item) => item.eligible).length;
    const market = result?.market || recommendations[0]?.market || "bist";
    const marketDecision = candidateCount === finite(result?.candidateCount, 0)
      ? result?.marketDecision
      : candidateCount > 0
        ? `YATIR · ${candidateCount} ${market === "crypto" ? "kripto" : "hisse"} performans korumasını geçti`
        : "YATIRMA · performans koruması yeni sinyali durdurdu";
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

  return { MAX_RECORDS, keyOf, compactSignal, resolveRecord, calculateStats, updateHistory, performanceGuard, applyPerformanceGuard };
});
