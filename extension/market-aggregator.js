(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FinPilotMarketAggregator = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

  function normalizeMarketResult(result, market) {
    if (result && typeof result === "object") return result;
    return {
      market,
      generatedAt: new Date().toISOString(),
      scannedCount: 0,
      requestedCount: 0,
      candidateCount: 0,
      errorCount: 1,
      marketDecision: "YATIRMA · veri alınamadı",
      recommendations: [],
      snapshot: [],
      errors: [{ symbol: market.toUpperCase(), message: "Piyasa sonucu üretilemedi" }],
      marketRegime: { gateOpen: false, dataSufficient: false, coveragePct: 0, breadthPct: 0 },
    };
  }

  function combineResults(bistInput, cryptoInput, now = new Date()) {
    const bist = normalizeMarketResult(bistInput, "bist");
    const crypto = normalizeMarketResult(cryptoInput, "crypto");
    const recommendations = [...(bist.recommendations || []), ...(crypto.recommendations || [])]
      .sort((a, b) => Number(b.eligible) - Number(a.eligible) || Number(b.nearMiss) - Number(a.nearMiss) || finite(b.rankScore) - finite(a.rankScore));
    const eligible = recommendations.filter((item) => item.eligible);
    const snapshot = [...(bist.snapshot || []), ...(crypto.snapshot || [])];
    const errors = [...(bist.errors || []), ...(crypto.errors || [])].slice(0, 24);
    const scannedCount = finite(bist.scannedCount) + finite(crypto.scannedCount);
    const requestedCount = finite(bist.requestedCount) + finite(crypto.requestedCount);
    const coveragePct = requestedCount ? scannedCount / requestedCount * 100 : 0;
    const marketDecision = eligible.length
      ? `YATIR · ${eligible.length} varlık tüm kapıları geçti`
      : scannedCount ? "YATIRMA · tüm koşulları geçen varlık yok" : "YATIRMA · piyasa verisi alınamadı";
    return {
      version: 4,
      mode: "fail-closed-recommendation",
      generatedAt: (now instanceof Date ? now : new Date(now)).toISOString(),
      dataAsOf: [bist.dataAsOf, crypto.dataAsOf].filter(Boolean).sort().at(-1) || null,
      universe: "Geniş BIST + Binance likit USDT spot",
      scannedCount,
      requestedCount,
      errorCount: finite(bist.errorCount) + finite(crypto.errorCount),
      candidateCount: eligible.length,
      marketDecision,
      marketRegime: {
        gateOpen: Boolean(bist.marketRegime?.gateOpen || crypto.marketRegime?.gateOpen),
        dataSufficient: Boolean(bist.marketRegime?.dataSufficient || crypto.marketRegime?.dataSufficient),
        coveragePct,
        breadthPct: scannedCount ? (finite(bist.marketRegime?.breadthPct) * finite(bist.scannedCount) + finite(crypto.marketRegime?.breadthPct) * finite(crypto.scannedCount)) / scannedCount : 0,
      },
      markets: { bist, crypto },
      recommendations,
      snapshot,
      errors,
      research: {
        failClosed: true,
        kapCheckedCount: finite(bist.research?.kapCheckedCount),
        deepResearchLimit: finite(bist.research?.deepResearchLimit),
        histories: { bist: ["1 gün", "5 gün", "20 gün"], crypto: ["4 saat", "1 gün", "7 gün"] },
      },
      source: { name: "İş Yatırım + KAP + Binance herkese açık piyasa verileri", timing: "BIST gün sonu; kripto kapanmış 4 saatlik mum" },
    };
  }

  return { normalizeMarketResult, combineResults };
});
