(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FinPilotPortfolioRisk = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const OPEN_STATUSES = new Set(["AÇIK", "EMİR BEKLİYOR", "AKTİF", "TAŞINAN STOP"]);

  function keyOf(item) {
    return `${item.market || "bist"}:${item.symbol}`;
  }

  function pearson(left, right) {
    if (!Array.isArray(left) || !Array.isArray(right)) return null;
    const size = Math.min(left.length, right.length);
    if (size < 12) return null;
    const a = left.slice(-size).map(Number);
    const b = right.slice(-size).map(Number);
    if (![...a, ...b].every(Number.isFinite)) return null;
    const meanA = a.reduce((sum, value) => sum + value, 0) / size;
    const meanB = b.reduce((sum, value) => sum + value, 0) / size;
    let covariance = 0;
    let varianceA = 0;
    let varianceB = 0;
    for (let index = 0; index < size; index += 1) {
      const deltaA = a[index] - meanA;
      const deltaB = b[index] - meanB;
      covariance += deltaA * deltaB;
      varianceA += deltaA * deltaA;
      varianceB += deltaB * deltaB;
    }
    if (!varianceA || !varianceB) return null;
    return clamp(covariance / Math.sqrt(varianceA * varianceB), -1, 1);
  }

  function activeExposures(history) {
    return (history?.records || []).filter((record) => OPEN_STATUSES.has(record.status)).map((record) => ({
      key: record.key || keyOf(record),
      market: record.market || "bist",
      symbol: record.symbol,
      displaySymbol: record.displaySymbol || record.symbol,
      sector: record.sector || (record.market === "crypto" ? "Kripto" : "Diğer"),
      returnSignature: Array.isArray(record.returnSignature) ? record.returnSignature : [],
      source: "active-paper",
    }));
  }

  function analyzeCandidate(item, exposures, options = {}) {
    const limits = {
      maxConcurrent: Math.max(1, Math.floor(finite(options.maxConcurrent, 5))),
      maxBistSector: Math.max(1, Math.floor(finite(options.maxBistSector, 2))),
      maxCrypto: Math.max(1, Math.floor(finite(options.maxCrypto, 3))),
      maxCorrelation: clamp(finite(options.maxCorrelation, 0.82), 0.3, 0.99),
    };
    const market = item.market || "bist";
    const sector = item.fundamental?.sector || item.sector || (market === "crypto" ? "Kripto" : "Diğer");
    const duplicate = exposures.some((exposure) => exposure.key === keyOf(item));
    const marketExposures = exposures.filter((exposure) => exposure.market === market);
    const correlations = marketExposures.map((exposure) => ({
      key: exposure.key,
      symbol: exposure.displaySymbol || exposure.symbol,
      value: pearson(item.returnSignature, exposure.returnSignature),
    })).filter((entry) => Number.isFinite(entry.value)).sort((a, b) => b.value - a.value);
    const highest = correlations[0] || null;
    const sectorCount = market === "bist" ? exposures.filter((exposure) => exposure.market === "bist" && exposure.sector === sector).length : 0;
    const cryptoCount = exposures.filter((exposure) => exposure.market === "crypto").length;
    const failures = [];
    if (duplicate) failures.push("Bu varlık için açık bir kâğıt emir/pozisyon zaten var.");
    if (!duplicate && exposures.length >= limits.maxConcurrent) failures.push(`Açık kâğıt pozisyon limiti ${exposures.length}/${limits.maxConcurrent}.`);
    if (!duplicate && market === "bist" && sectorCount >= limits.maxBistSector) failures.push(`${sector} yoğunluğu ${sectorCount}/${limits.maxBistSector}.`);
    if (!duplicate && market === "crypto" && cryptoCount >= limits.maxCrypto) failures.push(`Kripto yoğunluğu ${cryptoCount}/${limits.maxCrypto}.`);
    if (!duplicate && highest && highest.value >= limits.maxCorrelation) failures.push(`${highest.symbol} ile korelasyon ${highest.value.toFixed(2)}/${limits.maxCorrelation.toFixed(2)} azami.`);
    const correlationPenalty = highest ? Math.max(0, highest.value) * 0.40 : 0;
    const concentrationPenalty = market === "crypto" ? cryptoCount * 0.10 : sectorCount * 0.12;
    const riskBudgetMultiplier = clamp(1 - correlationPenalty - concentrationPenalty - exposures.length * 0.04, 0.25, 1);
    return {
      passed: failures.length === 0,
      failures,
      limits,
      activeCount: exposures.length,
      sector,
      sectorCount,
      cryptoCount,
      maxCorrelation: highest?.value ?? null,
      correlatedWith: highest?.symbol || null,
      correlations: correlations.slice(0, 3),
      riskBudgetMultiplier,
      suggestedRiskPct: Number((0.5 * riskBudgetMultiplier).toFixed(2)),
    };
  }

  function applyPortfolioRisk(result, history, options = {}) {
    const exposures = activeExposures(history);
    const accepted = [...exposures];
    const recommendations = (result?.recommendations || []).map((item) => {
      const analysis = analyzeCandidate(item, accepted, options);
      const message = analysis.passed
        ? `Portföy açık: ${analysis.activeCount}/${analysis.limits.maxConcurrent} açık · en yüksek korelasyon ${Number.isFinite(analysis.maxCorrelation) ? analysis.maxCorrelation.toFixed(2) : "hesaplanamadı"} · önerilen risk %${analysis.suggestedRiskPct}.`
        : analysis.failures.join(" ");
      const gates = { ...(item.gates || {}), portfolio: analysis.passed };
      const gateDiagnostics = { ...(item.gateDiagnostics || {}), portfolio: { passed: analysis.passed, label: "Portföy riski", message } };
      if (!item.eligible) {
        if (analysis.passed) return { ...item, gates, gateDiagnostics, portfolioRisk: analysis };
        const failedGates = [...(item.failedGates || []).filter((gate) => gate.key !== "portfolio"), { key: "portfolio", label: "Portföy riski", message }];
        return {
          ...item,
          gates,
          gateDiagnostics,
          failedGates,
          nearMiss: item.rankScore >= 55 && failedGates.length <= 3,
          distanceToEligible: failedGates.length,
          portfolioRisk: analysis,
          reasons: [...(item.reasons || []), `Portföy kapısı: ${message}`],
        };
      }
      if (analysis.passed) {
        accepted.push({ key: keyOf(item), market: item.market || "bist", symbol: item.symbol, displaySymbol: item.displaySymbol, sector: analysis.sector, returnSignature: item.returnSignature || [], source: "candidate" });
        return { ...item, gates, gateDiagnostics, portfolioRisk: analysis };
      }
      const failedGates = [...(item.failedGates || []).filter((gate) => gate.key !== "portfolio"), { key: "portfolio", label: "Portföy riski", message }];
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
        portfolioRisk: analysis,
        reasons: [...(item.reasons || []), `Portföy kapısı: ${message}`],
      };
    });
    const byKey = new Map(recommendations.map((item) => [keyOf(item), item]));
    const updateMarket = (marketResult, market) => {
      if (!marketResult) return marketResult;
      const marketRecommendations = (marketResult.recommendations || []).map((item) => byKey.get(keyOf(item)) || item);
      const count = marketRecommendations.filter((item) => item.eligible).length;
      return {
        ...marketResult,
        recommendations: marketRecommendations,
        candidateCount: count,
        marketDecision: count ? `YATIR · ${count} ${market === "crypto" ? "kripto" : "hisse"} portföy kapısını geçti` : "YATIRMA · tüm koşulları ve portföy sınırını geçen varlık yok",
        snapshot: (marketResult.snapshot || []).map((item) => ({ ...item, eligible: byKey.get(keyOf(item))?.eligible ?? item.eligible })),
      };
    };
    const candidateCount = recommendations.filter((item) => item.eligible).length;
    return {
      ...result,
      recommendations,
      candidateCount,
      marketDecision: candidateCount ? `YATIR · ${candidateCount} varlık portföy dahil tüm kapıları geçti` : "YATIRMA · tüm koşulları ve portföy sınırını geçen varlık yok",
      snapshot: (result?.snapshot || []).map((item) => ({ ...item, eligible: byKey.get(keyOf(item))?.eligible ?? item.eligible })),
      markets: result?.markets ? {
        bist: updateMarket(result.markets.bist, "bist"),
        crypto: updateMarket(result.markets.crypto, "crypto"),
      } : result?.markets,
      portfolioRisk: {
        activeCount: exposures.length,
        acceptedCandidateCount: accepted.length - exposures.length,
        limits: analyzeCandidate({ market: "bist", symbol: "__limits__" }, [], options).limits,
        openExposures: exposures.map(({ returnSignature, ...exposure }) => exposure),
      },
      research: { ...(result?.research || {}), portfolioRisk: true },
    };
  }

  return { OPEN_STATUSES, keyOf, pearson, activeExposures, analyzeCandidate, applyPortfolioRisk };
});
