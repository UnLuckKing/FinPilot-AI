(function (root, factory) {
  const engine = root.FinPilotEngine || (typeof require !== "undefined" ? require("./engine.js") : null);
  const api = factory(engine);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FinPilotCryptoScanner = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (engine) {
  "use strict";

  if (!engine) throw new Error("FinPilotEngine yüklenemedi.");

  const BINANCE_BASES = Object.freeze([
    "https://data-api.binance.vision",
    "https://api.binance.com",
    "https://api1.binance.com",
  ]);
  const STABLE_BASES = new Set(["USDC", "FDUSD", "TUSD", "USDP", "DAI", "EUR", "TRY", "AEUR", "EURI", "BFUSD", "USD1"]);
  const LEVERAGED_SUFFIX = /(UP|DOWN|BULL|BEAR)$/i;
  const CRYPTO_PROFILE = Object.freeze({
    threshold: 62,
    minimumTrades: 20,
    minimumProfitFactor: 1.25,
    minimumExpectancyR: 0.08,
    minimumModelProbability: 53,
    maximumBrierScore: 0.27,
    minimumDirectionProbability: 56,
    maximumDirectionDownProbability: 36,
    minimumStressProfitability: 58,
    maximumDataAgeHours: 9,
    minimumQuoteVolume: 5_000_000,
    minimumTrades24h: 2_000,
    maximumDailyMovePct: 22,
    universeLimit: 140,
    stopAtr: 2.2,
    rewardRisk: 2.2,
    horizon: 12,
    maxAtrPct: 14,
    cooldownBars: 4,
    maxHoldingBars: 96,
    allowShort: false,
    commissionPct: 0.10,
    slippagePct: 0.05,
    forecastHorizons: [1, 6, 42],
    primaryHorizon: 6,
    primaryHorizonLabel: "1 gün",
  });

  const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function decimalPlaces(step) {
    const text = String(step || "1").toLowerCase();
    if (text.includes("e-")) return Number(text.split("e-")[1]) || 0;
    return (text.split(".")[1] || "").replace(/0+$/, "").length;
  }

  function roundToStep(value, step, mode = "nearest") {
    const safeStep = Math.max(Number.EPSILON, finite(step, 1));
    const units = Math.max(0, finite(value)) / safeStep;
    const rounded = mode === "down" ? Math.floor(units + 1e-9) : mode === "up" ? Math.ceil(units - 1e-9) : Math.round(units);
    return Number((rounded * safeStep).toFixed(Math.min(12, decimalPlaces(safeStep))));
  }

  async function fetchJson(path, options = {}) {
    const fetcher = options.fetcher || fetch;
    const errors = [];
    for (const base of options.bases || BINANCE_BASES) {
      try {
        const response = await fetcher(`${base}${path}`, { cache: "no-store", headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error(`${response.status}`);
        return { data: await response.json(), base };
      } catch (error) {
        errors.push(`${base}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    throw new Error(`Binance piyasa verisi alınamadı (${errors.join("; ")})`);
  }

  function parseCryptoUniverse(exchangeInfo, tickers, options = {}) {
    const profile = { ...CRYPTO_PROFILE, ...(options.profile || {}) };
    const tickerMap = new Map((Array.isArray(tickers) ? tickers : []).map((ticker) => [ticker.symbol, ticker]));
    const assets = [];
    for (const symbolInfo of exchangeInfo?.symbols || []) {
      const baseAsset = String(symbolInfo.baseAsset || "").toUpperCase();
      const quoteAsset = String(symbolInfo.quoteAsset || "").toUpperCase();
      const ticker = tickerMap.get(symbolInfo.symbol) || {};
      const quoteVolume = finite(ticker.quoteVolume);
      const price = finite(ticker.lastPrice);
      const trades24h = finite(ticker.count);
      const priceChangePct = finite(ticker.priceChangePercent);
      const permissions = Array.isArray(symbolInfo.permissions) ? symbolInfo.permissions : [];
      const spotAllowed = symbolInfo.isSpotTradingAllowed !== false && (!permissions.length || permissions.includes("SPOT"));
      if (symbolInfo.status !== "TRADING" || quoteAsset !== "USDT" || !spotAllowed || !baseAsset || price <= 0) continue;
      if (STABLE_BASES.has(baseAsset) || LEVERAGED_SUFFIX.test(baseAsset)) continue;
      if (quoteVolume < profile.minimumQuoteVolume || trades24h < profile.minimumTrades24h) continue;
      const priceFilter = (symbolInfo.filters || []).find((filter) => filter.filterType === "PRICE_FILTER") || {};
      const lotFilter = (symbolInfo.filters || []).find((filter) => filter.filterType === "LOT_SIZE") || {};
      assets.push({
        symbol: symbolInfo.symbol,
        baseAsset,
        quoteAsset,
        price,
        quoteVolume,
        trades24h,
        priceChangePct,
        tickSize: finite(priceFilter.tickSize, Math.max(price * 0.000001, 0.00000001)),
        stepSize: finite(lotFilter.stepSize, 0.000001),
        exchangeStatus: symbolInfo.status,
      });
    }
    assets.sort((a, b) => b.quoteVolume - a.quoteVolume);
    const limit = Math.max(10, Math.floor(finite(options.limit, profile.universeLimit)));
    const selected = assets.slice(0, limit);
    const btc = assets.find((asset) => asset.symbol === "BTCUSDT");
    if (btc && !selected.some((asset) => asset.symbol === "BTCUSDT")) selected.unshift(btc);
    return selected.slice(0, limit);
  }

  async function fetchCryptoUniverse(options = {}) {
    if (options.exchangeInfo && options.tickers) return {
      assets: parseCryptoUniverse(options.exchangeInfo, options.tickers, options),
      totalTradingPairs: (options.exchangeInfo?.symbols || []).length,
      sourceBase: "provided",
    };
    const [exchange, ticker] = await Promise.all([
      fetchJson("/api/v3/exchangeInfo", options),
      fetchJson("/api/v3/ticker/24hr", options),
    ]);
    return {
      assets: parseCryptoUniverse(exchange.data, ticker.data, options),
      totalTradingPairs: (exchange.data?.symbols || []).length,
      sourceBase: exchange.base,
    };
  }

  function parseBinanceKlines(payload, now = new Date()) {
    const cutoff = (now instanceof Date ? now : new Date(now)).getTime();
    return (Array.isArray(payload) ? payload : []).map((item) => {
      const openTime = finite(item?.[0], NaN);
      const closeTime = finite(item?.[6], NaN);
      return {
        timestamp: openTime,
        closedAt: closeTime,
        time: Number.isFinite(openTime) ? new Date(openTime).toISOString() : "",
        open: finite(item?.[1], NaN),
        high: finite(item?.[2], NaN),
        low: finite(item?.[3], NaN),
        close: finite(item?.[4], NaN),
        volume: finite(item?.[5]),
      };
    }).filter((row) => Number.isFinite(row.timestamp) && Number.isFinite(row.closedAt) && row.closedAt <= cutoff && [row.open, row.high, row.low, row.close].every(Number.isFinite) && row.close > 0 && row.high >= row.low).sort((a, b) => a.timestamp - b.timestamp);
  }

  async function fetchCryptoHistory(asset, options = {}) {
    const interval = options.interval || "4h";
    const limit = Math.max(200, Math.min(1000, Math.floor(finite(options.historyLimit, 1000))));
    const response = await fetchJson(`/api/v3/klines?symbol=${encodeURIComponent(asset.symbol)}&interval=${encodeURIComponent(interval)}&limit=${limit}`, options);
    const rows = parseBinanceKlines(response.data, options.now || new Date());
    if (rows.length < 240) throw new Error(`${asset.symbol}: yalnızca ${rows.length} kapanmış mum bulundu`);
    return rows;
  }

  function dataAgeHours(closedAt, now = new Date()) {
    const end = (now instanceof Date ? now : new Date(now)).getTime();
    return Number.isFinite(closedAt) && Number.isFinite(end) ? Math.max(0, (end - closedAt) / 3600000) : Infinity;
  }

  function buildCryptoOrderPlan(rows, latest, asset, profile = CRYPTO_PROFILE) {
    const tick = Math.max(Number.EPSILON, finite(asset.tickSize));
    const lowerBound = latest.close - latest.atr * 0.80;
    const upperBound = latest.close - latest.atr * 0.08;
    const supportEntry = finite(latest.fast, latest.close) + latest.atr * 0.16;
    const limitBuy = roundToStep(clamp(Math.min(latest.close - latest.atr * 0.14, supportEntry), lowerBound, upperBound), tick, "down");
    const recentLows = rows.slice(-12).map((row) => row.low).filter(Number.isFinite);
    const swingLow = recentLows.length ? Math.min(...recentLows) : limitBuy - latest.atr * profile.stopAtr;
    const stopTrigger = roundToStep(Math.min(limitBuy - latest.atr * 1.70, swingLow - latest.atr * 0.08), tick, "down");
    const stopLimit = roundToStep(stopTrigger - Math.max(latest.atr * 0.14, tick * 3), tick, "down");
    const riskDistance = limitBuy - stopTrigger;
    const target1 = roundToStep(limitBuy + riskDistance * 1.50, tick);
    const target2 = roundToStep(limitBuy + riskDistance * 2.20, tick);
    const riskPct = limitBuy > 0 ? riskDistance / limitBuy * 100 : Infinity;
    const valid = limitBuy > 0 && stopLimit > 0 && stopLimit < stopTrigger && stopTrigger < limitBuy && target1 > limitBuy && target2 > target1 && riskDistance >= latest.atr * 1.50 && riskDistance <= latest.atr * 3.20 && riskPct <= 12;
    return {
      valid,
      limitBuy,
      stopTrigger,
      stopLimit,
      target1,
      target2,
      riskDistance,
      riskPct,
      rewardRisk1: riskDistance > 0 ? (target1 - limitBuy) / riskDistance : 0,
      rewardRisk2: riskDistance > 0 ? (target2 - limitBuy) / riskDistance : 0,
      validUntil: new Date((rows.at(-1)?.closedAt || Date.now()) + 24 * 3600000).toISOString(),
      warning: "Kripto 24/7 işlem görür; stop-limit sert harekette gerçekleşmeyebilir.",
    };
  }

  function evaluateCrypto(analysis, asset, profile = CRYPTO_PROFILE) {
    const backtest = analysis.backtest;
    const primary = analysis.forecasts?.find((forecast) => forecast.horizon === profile.primaryHorizon);
    const setup = analysis.decision === "LONG ADAYI";
    const backtestEdge = backtest.totalTrades >= profile.minimumTrades && backtest.profitFactor >= profile.minimumProfitFactor && backtest.expectancyR >= profile.minimumExpectancyR;
    const modelEdge = analysis.model.available && analysis.model.probabilityUp >= profile.minimumModelProbability && analysis.model.outOfSampleAccuracy >= 48 && analysis.model.brierScore <= profile.maximumBrierScore;
    const directionEdge = Boolean(primary?.available) && primary.probabilityUp >= profile.minimumDirectionProbability && primary.probabilityDown <= profile.maximumDirectionDownProbability && primary.expectedMedianPct > 0;
    const recentEdge = backtest.recentTrades >= 6 && backtest.recentExpectancyR > 0 && backtest.recentProfitFactor >= 1;
    const stressEdge = Boolean(backtest.stress?.available) && backtest.stress.profitablePct >= profile.minimumStressProfitability;
    const liquidityEdge = asset.quoteVolume >= profile.minimumQuoteVolume && asset.trades24h >= profile.minimumTrades24h && Math.abs(asset.priceChangePct) <= profile.maximumDailyMovePct;
    const profitFactorScore = Number.isFinite(backtest.profitFactor) ? clamp(backtest.profitFactor * 38, 0, 100) : 100;
    const directionScore = primary?.available ? primary.probabilityUp : 0;
    const modelScore = analysis.model.available ? analysis.model.probabilityUp : 50;
    let score = analysis.setupScore * 0.27 + analysis.estimatedProbability * 0.15 + profitFactorScore * 0.14 + modelScore * 0.11 + directionScore * 0.17 + clamp(50 + backtest.recentExpectancyR * 40, 0, 100) * 0.08 + clamp(backtest.stress?.profitablePct || 0, 0, 100) * 0.08;
    if (setup) score += 7;
    return { setup, backtestEdge, modelEdge, directionEdge, recentEdge, stressEdge, liquidityEdge, score: clamp(score, 0, 100) };
  }

  function buildCryptoRecommendation(asset, rows, analysis, options = {}) {
    const profile = { ...CRYPTO_PROFILE, ...(options.profile || {}) };
    const latest = analysis.latest;
    const evaluation = evaluateCrypto(analysis, asset, profile);
    const orderPlan = buildCryptoOrderPlan(rows, latest, asset, profile);
    const ageHours = dataAgeHours(rows.at(-1)?.closedAt, options.now || new Date());
    const dataFresh = ageHours <= profile.maximumDataAgeHours;
    const forecasts = Object.fromEntries((analysis.forecasts || []).map((forecast) => [String(forecast.horizon), forecast]));
    const primary = forecasts[String(profile.primaryHorizon)];
    const preEligible = evaluation.setup && evaluation.backtestEdge && evaluation.modelEdge && evaluation.directionEdge && evaluation.recentEdge && evaluation.stressEdge && evaluation.liquidityEdge && orderPlan.valid && dataFresh;
    const gates = {
      setup: evaluation.setup,
      backtest: evaluation.backtestEdge,
      model: evaluation.modelEdge,
      direction: evaluation.directionEdge,
      recentRegime: evaluation.recentEdge,
      stress: evaluation.stressEdge,
      liquidity: evaluation.liquidityEdge,
      orderPlan: orderPlan.valid,
      dataFresh,
      market: false,
    };
    return {
      market: "crypto",
      marketLabel: "KRİPTO",
      assetType: "SPOT",
      symbol: asset.symbol,
      displaySymbol: asset.baseAsset,
      quoteAsset: asset.quoteAsset,
      action: "YATIRMA",
      eligible: false,
      preEligible,
      rankScore: evaluation.score,
      setupScore: analysis.setupScore,
      trendDirection: latest.trend,
      price: latest.close,
      priceDecimals: Math.min(10, Math.max(2, decimalPlaces(asset.tickSize))),
      dataDate: new Date(rows.at(-1)?.closedAt || rows.at(-1)?.timestamp).toISOString(),
      dataAgeHours: ageHours,
      dataFresh,
      atrPct: latest.atrPct,
      volumeRatio: latest.volumeRatio,
      quoteVolume24h: asset.quoteVolume,
      trades24h: asset.trades24h,
      priceChangePct24h: asset.priceChangePct,
      historicalProbability: analysis.backtest.totalTrades >= profile.minimumTrades ? analysis.backtest.smoothedWinProbability : null,
      probabilityLow: analysis.backtest.totalTrades >= profile.minimumTrades ? analysis.backtest.confidenceLow : null,
      probabilityHigh: analysis.backtest.totalTrades >= profile.minimumTrades ? analysis.backtest.confidenceHigh : null,
      profitFactor: analysis.backtest.profitFactor,
      expectancyR: analysis.backtest.expectancyR,
      totalTrades: analysis.backtest.totalTrades,
      maxDrawdownR: analysis.backtest.maxDrawdownR,
      recentExpectancyR: analysis.backtest.recentExpectancyR,
      recentProfitFactor: analysis.backtest.recentProfitFactor,
      stress: analysis.backtest.stress,
      modelProbabilityUp: analysis.model.available ? analysis.model.probabilityUp : null,
      modelAccuracy: analysis.model.available ? analysis.model.outOfSampleAccuracy : null,
      fundamental: { available: false, score: null, status: "Kriptoda uygulanmaz" },
      kap: { available: true, blocked: false, status: "Kriptoda uygulanmaz" },
      forecasts,
      forecastDisplay: [
        { key: "1", label: "4 SAAT" },
        { key: "6", label: "1 GÜN" },
        { key: "42", label: "7 GÜN" },
      ],
      direction: primary?.available ? primary.direction : "BELİRSİZ",
      confidence: analysis.probabilityLabel,
      orderPlan,
      levels: { limitBuy: orderPlan.limitBuy, stopTrigger: orderPlan.stopTrigger, stopLimit: orderPlan.stopLimit, target1: orderPlan.target1, target2: orderPlan.target2 },
      gates,
      reasons: [
        `Binance spot hacmi ${Math.round(asset.quoteVolume / 1_000_000).toLocaleString("tr-TR")} milyon USDT; 24 saatlik hareket %${asset.priceChangePct.toFixed(2)}.`,
        `4 saatlik kurulum puanı ${analysis.setupScore.toFixed(1)}; piyasa yönü ${latest.trend > 0 ? "yukarı" : latest.trend < 0 ? "aşağı" : "yatay"}.`,
        `Masraflı backtest: ${analysis.backtest.totalTrades} işlem, PF ${Number.isFinite(analysis.backtest.profitFactor) ? analysis.backtest.profitFactor.toFixed(2) : "∞"}, beklenti ${analysis.backtest.expectancyR.toFixed(2)}R.`,
        primary?.available ? `1 günlük yön: yükseliş %${primary.probabilityUp.toFixed(1)}, düşüş %${primary.probabilityDown.toFixed(1)}, yatay %${primary.probabilityFlat.toFixed(1)}.` : "1 günlük yön modeli için benzer dönem yetersiz.",
        analysis.model.available ? `Yerel model yükseliş %${analysis.model.probabilityUp.toFixed(1)}; kronolojik test doğruluğu %${analysis.model.outOfSampleAccuracy.toFixed(1)}.` : "Yerel model için veri yetersiz.",
        analysis.backtest.stress?.available ? `Stres senaryolarının %${analysis.backtest.stress.profitablePct.toFixed(1)} kadarı pozitif kapandı.` : "Stres testi için işlem sayısı yetersiz.",
        dataFresh ? `Son kapanmış 4 saatlik mum ${ageHours.toFixed(1)} saat yaşında.` : `Veri ${ageHours.toFixed(1)} saat yaşında; tazelik kapısı kapalı.`,
      ],
      links: {
        tradingView: `https://tr.tradingview.com/chart/?symbol=BINANCE%3A${asset.symbol}`,
        exchange: `https://www.binance.com/en/trade/${asset.baseAsset}_${asset.quoteAsset}?type=spot`,
        kap: null,
      },
    };
  }

  function finalizeCryptoRecommendation(item, marketGateOpen, dataSufficient, btcHealthy) {
    const marketGate = Boolean(marketGateOpen) && Boolean(dataSufficient);
    const eligible = Boolean(item.preEligible) && marketGate;
    const gates = { ...item.gates, market: marketGate };
    const gateLabels = { setup: "Kurulum", backtest: "Backtest", model: "ML", direction: "Yön", recentRegime: "Yakın dönem", stress: "Stres", liquidity: "Likidite/pump", orderPlan: "Emir planı", dataFresh: "Tazelik", market: "BTC/piyasa" };
    const failedGates = Object.entries(gates).filter(([, passed]) => !passed).map(([key]) => ({ key, label: gateLabels[key] || key }));
    const reasons = [...item.reasons];
    if (!btcHealthy) reasons.push("BTC trend kapısı güçlü değil; altcoin sinyalleri piyasa genişliğiyle ayrıca sınırlandı.");
    if (!marketGateOpen) reasons.push("Kripto piyasa rejimi kapalı olduğu için YATIRMA.");
    if (!dataSufficient) reasons.push("Kripto tarama kapsamı yetersiz olduğu için YATIRMA.");
    return {
      ...item,
      action: eligible ? "YATIR" : "YATIRMA",
      eligible,
      nearMiss: !eligible && item.rankScore >= 55 && failedGates.length <= 3,
      failedGates,
      distanceToEligible: failedGates.length,
      gates,
      reasons,
    };
  }

  async function scanAssets(assets, options = {}) {
    const results = [];
    const errors = [];
    let cursor = 0;
    let completed = 0;
    const profile = { ...CRYPTO_PROFILE, ...(options.profile || {}) };
    const worker = async () => {
      while (cursor < assets.length) {
        const asset = assets[cursor];
        cursor += 1;
        try {
          const rows = options.histories?.get(asset.symbol) || await fetchCryptoHistory(asset, { ...options, now: options.now });
          const analysis = engine.analyze(rows, profile);
          results.push(buildCryptoRecommendation(asset, rows, analysis, { ...options, profile }));
        } catch (error) {
          errors.push({ symbol: asset.symbol, message: error instanceof Error ? error.message : String(error) });
        } finally {
          completed += 1;
          if (typeof options.onProgress === "function") options.onProgress({ market: "crypto", completed, total: assets.length, symbol: asset.symbol });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(Math.max(1, Math.floor(finite(options.concurrency, 6))), assets.length) }, worker));
    return { results, errors };
  }

  async function runScan(options = {}) {
    const now = options.now instanceof Date ? options.now : options.now ? new Date(options.now) : new Date();
    const universeResult = options.assets
      ? { assets: options.assets, totalTradingPairs: options.assets.length, sourceBase: "test" }
      : await fetchCryptoUniverse({ ...options, now });
    const scanned = await scanAssets(universeResult.assets, { ...options, now });
    const coveragePct = universeResult.assets.length ? scanned.results.length / universeResult.assets.length * 100 : 0;
    const dataSufficient = universeResult.assets.length < 10 || coveragePct >= 70;
    const positiveTrendCount = scanned.results.filter((item) => item.trendDirection > 0).length;
    const breadthPct = scanned.results.length ? positiveTrendCount / scanned.results.length * 100 : 0;
    const btc = scanned.results.find((item) => item.symbol === "BTCUSDT");
    const btcHealthy = Boolean(btc && btc.trendDirection > 0 && btc.dataFresh);
    const marketGateOpen = dataSufficient && (btcHealthy || breadthPct >= 45);
    const allRecommendations = scanned.results.map((item) => finalizeCryptoRecommendation(item, marketGateOpen, dataSufficient, btcHealthy))
      .sort((a, b) => Number(b.eligible) - Number(a.eligible) || Number(b.nearMiss) - Number(a.nearMiss) || b.rankScore - a.rankScore);
    const candidates = allRecommendations.filter((item) => item.eligible);
    const displayLimit = Math.max(12, Math.floor(finite(options.displayLimit, 30)));
    return {
      version: 1,
      market: "crypto",
      mode: "fail-closed-recommendation",
      generatedAt: now.toISOString(),
      dataAsOf: allRecommendations.map((item) => item.dataDate).filter(Boolean).sort().at(-1) || null,
      universe: `Binance likit USDT spot evreni · ${universeResult.assets.length} çift`,
      scannedCount: scanned.results.length,
      requestedCount: universeResult.assets.length,
      totalTradingPairs: universeResult.totalTradingPairs,
      errorCount: scanned.errors.length,
      candidateCount: candidates.length,
      marketDecision: candidates.length ? `YATIR · ${candidates.length} kripto tüm kapıları geçti` : !dataSufficient ? "YATIRMA · kripto verisi yetersiz" : marketGateOpen ? "YATIRMA · tüm koşulları geçen kripto yok" : "YATIRMA · BTC/piyasa rejimi zayıf",
      marketRegime: { gateOpen: marketGateOpen, dataSufficient, coveragePct, breadthPct, positiveTrendCount, sampleSize: scanned.results.length, btcHealthy, btcDirection: btc?.direction || "BELİRSİZ" },
      recommendations: allRecommendations.slice(0, displayLimit),
      snapshot: allRecommendations.map((item) => ({ market: item.market, symbol: item.symbol, displaySymbol: item.displaySymbol, price: item.price, dataDate: item.dataDate, eligible: item.eligible })),
      errors: scanned.errors.slice(0, 12),
      research: { failClosed: true, horizons: ["4 saat", "1 gün", "7 gün"], provider: "Binance public market data" },
      source: { name: "Binance herkese açık spot piyasa verisi", url: "https://developers.binance.com/en/docs/products/spot/rest-api", timing: "Kapanmış 4 saatlik mumlar" },
    };
  }

  return {
    BINANCE_BASES,
    CRYPTO_PROFILE,
    decimalPlaces,
    roundToStep,
    parseCryptoUniverse,
    fetchCryptoUniverse,
    parseBinanceKlines,
    fetchCryptoHistory,
    dataAgeHours,
    buildCryptoOrderPlan,
    evaluateCrypto,
    buildCryptoRecommendation,
    finalizeCryptoRecommendation,
    scanAssets,
    runScan,
  };
});
