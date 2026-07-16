(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FinPilotNearWatch = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MAX_ITEMS = 24;
  const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

  function keyOf(item) {
    return `${item.market || "bist"}:${item.symbol}`;
  }

  function compact(item, previous, now) {
    const distance = Math.max(0, Math.floor(finite(item.distanceToEligible, item.failedGates?.length || 0)));
    const previousDistance = Number.isFinite(previous?.distanceToEligible) ? previous.distanceToEligible : null;
    return {
      key: keyOf(item),
      market: item.market || "bist",
      marketLabel: item.marketLabel || (item.market === "crypto" ? "KRİPTO" : "BIST"),
      symbol: item.symbol,
      displaySymbol: item.displaySymbol || item.symbol,
      rankScore: finite(item.rankScore),
      distanceToEligible: distance,
      previousDistance,
      strategyId: item.strategy?.id || "trend",
      strategyLabel: item.strategy?.label || "Trend devamı",
      failedGates: (item.failedGates || []).map((gate) => ({ key: gate.key, label: gate.label, message: gate.message })).slice(0, 5),
      firstSeenAt: previous?.firstSeenAt || now.toISOString(),
      lastSeenAt: now.toISOString(),
      improved: previousDistance != null && distance < previousDistance,
      newlyAdded: !previous,
    };
  }

  function updateWatch(previous, result, nowInput = new Date()) {
    const now = nowInput instanceof Date ? nowInput : new Date(nowInput);
    const oldItems = Array.isArray(previous?.items) ? previous.items : [];
    const oldMap = new Map(oldItems.map((item) => [item.key, item]));
    const candidates = (result?.recommendations || [])
      .filter((item) => item.nearMiss && !item.eligible)
      .sort((a, b) => finite(a.distanceToEligible, 99) - finite(b.distanceToEligible, 99) || finite(b.rankScore) - finite(a.rankScore))
      .slice(0, MAX_ITEMS);
    const items = candidates.map((item) => compact(item, oldMap.get(keyOf(item)), now));
    const promotions = (result?.recommendations || [])
      .filter((item) => item.eligible && oldMap.has(keyOf(item)))
      .map((item) => ({ key: keyOf(item), market: item.market, symbol: item.symbol, displaySymbol: item.displaySymbol || item.symbol, kind: "eligible", message: "Tüm kapıları geçti." }));
    const improvements = [
      ...items.filter((item) => item.improved).map((item) => ({ key: item.key, market: item.market, symbol: item.symbol, displaySymbol: item.displaySymbol, kind: "closer", from: item.previousDistance, to: item.distanceToEligible, message: `${item.previousDistance} eksik kapıdan ${item.distanceToEligible} eksik kapıya yaklaştı.` })),
      ...promotions,
    ];
    return {
      version: 1,
      updatedAt: now.toISOString(),
      items,
      improvements,
      count: items.length,
      note: "Yakın takip yalnızca ardışık taramalardaki kapı mesafesini izler; fiyat veya getiri garantisi değildir.",
    };
  }

  function attachToResult(result, watch) {
    const watchMap = new Map((watch?.items || []).map((item) => [item.key, item]));
    const recommendations = (result?.recommendations || []).map((item) => {
      const tracked = watchMap.get(keyOf(item));
      return tracked ? { ...item, autoWatched: true, watchState: tracked } : item;
    });
    return {
      ...result,
      recommendations,
      nearWatch: watch,
      research: { ...(result?.research || {}), nearWatchCount: watch?.count || 0 },
    };
  }

  return { MAX_ITEMS, keyOf, compact, updateWatch, attachToResult };
});
