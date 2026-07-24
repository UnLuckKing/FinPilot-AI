(() => {
  const REJECTED_TICKERS = new Set([
    "SYMBOL",
    "SEARCH",
    "CHART",
    "GRAFIK",
    "GRAFİK",
    "AL",
    "SAT",
    "BUY",
    "SELL"
  ]);
  const KNOWN_EXCHANGES = [
    "BIST",
    "NASDAQ",
    "NYSE",
    "AMEX",
    "BINANCE",
    "BINANCEUS",
    "BYBIT",
    "OKX",
    "COINBASE",
    "KRAKEN",
    "FX_IDC",
    "OANDA",
    "FOREXCOM",
    "CME_MINI",
    "CME",
    "CBOT_MINI",
    "CBOT",
    "COMEX",
    "NYMEX",
    "TVC",
    "INDEX"
  ];

  function normalizeFullSymbol(value) {
    const text = safeDecode(value).toUpperCase().trim();
    const match = text.match(/(?:^|\b)([A-Z0-9_]+):([A-Z0-9_.!/\-]+)(?:\b|$)/u);
    return match ? `${match[1]}:${match[2]}` : null;
  }

  function tickerOnly(value) {
    const text = safeDecode(value).toUpperCase().trim();
    if (/^[A-Z0-9_.!/\-]{1,24}$/u.test(text) && !REJECTED_TICKERS.has(text)) return text;
    return null;
  }

  function tickerFromTitle(title) {
    const text = String(title ?? "").toUpperCase().trim();
    const full = normalizeFullSymbol(text);
    if (full) return full.split(":").slice(1).join(":");
    const match = text.match(/^([A-Z0-9_.!/\-]{1,24})(?:\s|$)/u);
    return tickerOnly(match?.[1]);
  }

  function chooseSymbolDetails({ urlSymbol, chartValues = [], toolbarValues = [], title = "" } = {}) {
    const urlFull = normalizeFullSymbol(urlSymbol);
    const fallbackExchange = urlFull?.split(":")[0] ??
      exchangeFromValues([...chartValues, ...toolbarValues, title]);
    const candidates = [];

    addFullCandidates(candidates, chartValues, "grafik verisi", 100);
    addFullCandidates(candidates, [title], "grafik başlığı", 94);
    addTickerCandidate(candidates, tickerFromTitle(title), fallbackExchange, "grafik başlığı", 88);
    addTickerValues(candidates, chartValues, fallbackExchange, "grafik etiketi", 84);
    addFullCandidates(candidates, toolbarValues, "sembol araç çubuğu", 82);
    addTickerValues(candidates, toolbarValues, fallbackExchange, "sembol araç çubuğu", 76);
    if (urlFull) candidates.push(candidate(urlFull, "TradingView adresi", 55));

    const grouped = new Map();
    for (const item of candidates) {
      const existing = grouped.get(item.symbol);
      if (!existing) {
        grouped.set(item.symbol, { ...item, votes: 1, sources: [item.source] });
        continue;
      }
      existing.votes += 1;
      existing.confidence = Math.min(100, Math.max(existing.confidence, item.confidence) + 3);
      if (!existing.sources.includes(item.source)) existing.sources.push(item.source);
      if (item.confidence > existing.primaryConfidence) {
        existing.source = item.source;
        existing.primaryConfidence = item.confidence;
      }
    }

    const ranked = [...grouped.values()].sort((left, right) =>
      right.confidence - left.confidence ||
      right.votes - left.votes ||
      left.symbol.localeCompare(right.symbol)
    );
    const selected = ranked[0];
    if (!selected) return null;
    return {
      symbol: selected.symbol,
      source: selected.source,
      confidence: selected.confidence,
      votes: selected.votes,
      ambiguous: Boolean(ranked[1] && selected.confidence - ranked[1].confidence < 8),
      alternatives: ranked.slice(1, 3).map((item) => item.symbol)
    };
  }

  function chooseSymbol(input) {
    return chooseSymbolDetails(input)?.symbol ?? null;
  }

  function exchangeFromValues(values) {
    const text = safeDecode(values.filter(Boolean).join(" ")).toUpperCase();
    return KNOWN_EXCHANGES.find((exchange) => new RegExp(`(?:^|[^A-Z0-9_])${exchange}(?:[^A-Z0-9_]|$)`, "u").test(text)) ?? "";
  }

  function addFullCandidates(target, values, source, confidence) {
    for (const value of values) {
      const full = normalizeFullSymbol(value);
      if (full) target.push(candidate(full, source, confidence));
    }
  }

  function addTickerValues(target, values, exchange, source, confidence) {
    if (!exchange) return;
    for (const value of values) {
      if (normalizeFullSymbol(value)) continue;
      addTickerCandidate(target, tickerOnly(value), exchange, source, confidence);
    }
  }

  function addTickerCandidate(target, ticker, exchange, source, confidence) {
    if (ticker && exchange) target.push(candidate(`${exchange}:${ticker}`, source, confidence));
  }

  function candidate(symbol, source, confidence) {
    return { symbol, source, confidence, primaryConfidence: confidence };
  }

  function safeDecode(value) {
    try {
      return decodeURIComponent(String(value ?? ""));
    } catch {
      return String(value ?? "");
    }
  }

  globalThis.FinPilotDetection = Object.freeze({
    normalizeFullSymbol,
    tickerOnly,
    tickerFromTitle,
    exchangeFromValues,
    chooseSymbol,
    chooseSymbolDetails
  });
})();
