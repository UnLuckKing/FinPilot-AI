const INDEX_MAP = Object.freeze({
  "TVC:SPX": "^GSPC",
  "SP:SPX": "^GSPC",
  "NASDAQ:NDX": "^NDX",
  "TVC:DJI": "^DJI",
  "TVC:DXY": "DX-Y.NYB",
  "BIST:XU100": "XU100.IS",
  "BIST:XU030": "XU030.IS",
  "TVC:UKX": "^FTSE",
  "INDEX:DAX": "^GDAXI",
  "TVC:NI225": "^N225",
  "TVC:VIX": "^VIX"
});

const FUTURES_MAP = Object.freeze({
  "COMEX:GC1!": "GC=F",
  "COMEX:SI1!": "SI=F",
  "COMEX:HG1!": "HG=F",
  "NYMEX:CL1!": "CL=F",
  "NYMEX:NG1!": "NG=F",
  "NYMEX:RB1!": "RB=F",
  "NYMEX:PL1!": "PL=F",
  "CBOT:ZC1!": "ZC=F",
  "CBOT:ZW1!": "ZW=F",
  "CBOT:ZS1!": "ZS=F",
  "CME_MINI:ES1!": "ES=F",
  "CME_MINI:NQ1!": "NQ=F",
  "CME_MINI:RTY1!": "RTY=F",
  "CBOT_MINI:YM1!": "YM=F",
  "ICEUS:DX1!": "DX=F",
  "CME:BTC1!": "BTC=F"
});

const SUFFIX_BY_EXCHANGE = Object.freeze({
  BIST: ".IS",
  LSE: ".L",
  XETR: ".DE",
  FWB: ".F",
  EURONEXT: ".PA",
  MIL: ".MI",
  BME: ".MC",
  TSX: ".TO",
  ASX: ".AX",
  HKEX: ".HK",
  TSE: ".T"
});

const FOREX_EXCHANGES = new Set(["FX", "FX_IDC", "OANDA", "FOREXCOM", "SAXO", "PEPPERSTONE"]);
const CRYPTO_EXCHANGES = new Set(["BINANCE", "BINANCEUS", "BYBIT", "OKX", "COINBASE", "KRAKEN", "BITSTAMP"]);
const STOCK_EXCHANGES = new Set(["BIST", "NASDAQ", "NYSE", "AMEX", "LSE", "XETR", "FWB", "EURONEXT", "MIL", "BME", "TSX", "ASX", "HKEX", "TSE"]);
const FUTURES_EXCHANGES = new Set(["CME", "CME_MINI", "CBOT", "CBOT_MINI", "COMEX", "NYMEX", "ICEUS"]);

export function parseTradingViewSymbol(value) {
  const clean = decodeURIComponent(String(value ?? ""))
    .trim()
    .toUpperCase()
    .replace(/^SYMBOL=/u, "")
    .replace(/[^A-Z0-9_.!:\-/]/gu, "");
  if (!clean) return null;
  const [exchange, ...parts] = clean.split(":");
  if (parts.length === 0) {
    return { full: clean, exchange: "", ticker: clean, market: inferMarket("", clean) };
  }
  const ticker = parts.join(":");
  if (!exchange || !ticker) return null;
  return { full: `${exchange}:${ticker}`, exchange, ticker, market: inferMarket(exchange, ticker) };
}

export function inferMarket(exchange, ticker) {
  if (/OPTION|OPT$/u.test(exchange) || /\d{6}[CP]\d+/u.test(ticker)) return "OPTION";
  if (CRYPTO_EXCHANGES.has(exchange) || /USDT$|USDC$|BTC$|ETH$/u.test(ticker)) return "CRYPTO";
  if (FOREX_EXCHANGES.has(exchange) || /^[A-Z]{6}$/u.test(ticker)) return "FOREX";
  if (FUTURES_EXCHANGES.has(exchange) || ticker.endsWith("1!")) return "FUTURES";
  if (INDEX_MAP[`${exchange}:${ticker}`] || ticker.startsWith("XU")) return "INDEX";
  if (STOCK_EXCHANGES.has(exchange)) return "STOCK";
  if (exchange === "TVC" && /GOLD|SILVER|OIL|COPPER|PLATINUM/u.test(ticker)) return "COMMODITY";
  return "OTHER";
}

export function resolveProviderSymbol(input) {
  const parsed = typeof input === "string" ? parseTradingViewSymbol(input) : input;
  if (!parsed) return { ok: false, reason: "TradingView sembolü algılanamadı" };
  if (parsed.market === "OPTION") {
    return { ok: false, reason: "Opsiyon için vade, kullanım fiyatı ve oynaklık verisi gerekli", parsed };
  }

  if (parsed.exchange === "BINANCE" || parsed.exchange === "BINANCEUS") {
    const ticker = parsed.ticker.replace(/[^A-Z0-9]/gu, "");
    return { ok: Boolean(ticker), provider: "BINANCE", symbol: ticker, parsed };
  }

  const full = `${parsed.exchange}:${parsed.ticker}`;
  if (INDEX_MAP[full]) return { ok: true, provider: "YAHOO", symbol: INDEX_MAP[full], parsed };
  if (FUTURES_MAP[full]) return { ok: true, provider: "YAHOO", symbol: FUTURES_MAP[full], parsed };

  if (parsed.market === "FOREX") {
    const pair = parsed.ticker.replace(/[^A-Z]/gu, "").slice(0, 6);
    return pair.length === 6
      ? { ok: true, provider: "YAHOO", symbol: `${pair}=X`, parsed }
      : { ok: false, reason: "Forex çifti eşleştirilemedi", parsed };
  }

  if (parsed.market === "CRYPTO") {
    const match = parsed.ticker.match(/^([A-Z0-9]+?)(USDT|USDC|USD|EUR|BTC|ETH)$/u);
    if (!match) return { ok: false, reason: "Kripto çifti eşleştirilemedi", parsed };
    const quote = match[2] === "USDT" || match[2] === "USDC" ? "USD" : match[2];
    return { ok: true, provider: "YAHOO", symbol: `${match[1]}-${quote}`, parsed };
  }

  if (parsed.market === "FUTURES") {
    return { ok: false, reason: "Bu sürekli vadeli sembol için doğrulanmış veri eşlemesi yok", parsed };
  }

  if (parsed.exchange === "NASDAQ" || parsed.exchange === "NYSE" || parsed.exchange === "AMEX") {
    return { ok: true, provider: "YAHOO", symbol: parsed.ticker.replace(/[/.]/gu, "-"), parsed };
  }

  if (SUFFIX_BY_EXCHANGE[parsed.exchange]) {
    const suffix = SUFFIX_BY_EXCHANGE[parsed.exchange];
    return { ok: true, provider: "YAHOO", symbol: `${parsed.ticker.replace("/", "-")}${suffix}`, parsed };
  }

  if (!parsed.exchange && /^[A-Z0-9.^=-]{1,20}$/u.test(parsed.ticker)) {
    return { ok: true, provider: "YAHOO", symbol: parsed.ticker, parsed };
  }

  return { ok: false, reason: "Bu borsa için güvenilir otomatik sembol eşlemesi yok", parsed };
}

export function sanitizeSymbolList(values, maximum = 40) {
  const seen = new Set();
  const result = [];
  for (const value of Array.isArray(values) ? values : []) {
    const parsed = parseTradingViewSymbol(value);
    if (!parsed || seen.has(parsed.full)) continue;
    seen.add(parsed.full);
    result.push(parsed.full);
    if (result.length >= maximum) break;
  }
  return result;
}

export { INDEX_MAP, FUTURES_MAP };
