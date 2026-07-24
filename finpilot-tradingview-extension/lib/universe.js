const BIST = symbols("BIST", [
  "AEFES", "AGHOL", "AKBNK", "AKSA", "AKSEN", "ALARK", "ALBRK", "ANHYT", "ANSGR", "ARCLK",
  "ASELS", "ASTOR", "BERA", "BIMAS", "BINHO", "BOBET", "BRSAN", "BTCIM", "CANTE", "CCOLA",
  "CIMSA", "CLEBI", "CWENE", "DOAS", "DOHOL", "DSTKF", "EGEEN", "EKGYO", "ENJSA", "ENKAI",
  "EREGL", "EUPWR", "FROTO", "GARAN", "GENIL", "GLYHO", "GOLTS", "GRSEL", "GUBRF", "HALKB",
  "HEKTS", "ISCTR", "ISDMR", "ISGYO", "KARSN", "KCAER", "KCHOL", "KONTR", "KOZAL", "KRDMD",
  "KTLEV", "LMKDC", "MAVI", "MGROS", "MIATK", "MPARK", "NTHOL", "OBAMS", "ODAS", "OYAKC",
  "PETKM", "PGSUS", "REEDR", "SAHOL", "SASA", "SELEC", "SISE", "SKBNK", "SMRTG", "SOKM",
  "TAVHL", "TCELL", "THYAO", "TKFEN", "TRALT", "TSKB", "TTKOM", "TTRAK", "TUPRS", "TURSG",
  "ULKER", "VAKBN", "VESTL", "YEOTK", "YKBNK", "ZOREN"
]);

const US = [
  ...symbols("NASDAQ", [
    "AAPL", "ADBE", "ADI", "ADP", "AMD", "AMAT", "AMGN", "AMZN", "ARM", "ASML", "AVGO", "BKNG",
    "CDNS", "COST", "CRWD", "CSCO", "CSX", "DASH", "DDOG", "GOOG", "GOOGL", "HON", "INTC", "INTU",
    "ISRG", "LIN", "LRCX", "MAR", "MELI", "META", "MRNA", "MSFT", "MU", "NFLX", "NVDA", "NXPI",
    "ODFL", "ORLY", "PANW", "PAYX", "PYPL", "QCOM", "REGN", "ROP", "SBUX", "SNPS", "TEAM", "TMUS",
    "TSLA", "TXN", "VRTX", "WDAY", "XEL", "ZS"
  ]),
  ...symbols("NYSE", [
    "ABBV", "ABT", "ACN", "BAC", "BRK.B", "CAT", "CRM", "CVX", "DE", "DIS", "GE", "GM", "GS",
    "HD", "IBM", "JNJ", "JPM", "KO", "LLY", "MA", "MCD", "MRK", "NKE", "NOW", "ORCL", "PEP",
    "PFE", "PG", "PLTR", "RTX", "T", "UBER", "UNH", "UPS", "V", "VZ", "WMT", "XOM"
  ]),
  ...symbols("AMEX", [
    "SPY", "QQQ", "IWM", "DIA", "RSP", "VTI", "VOO", "ARKK",
    "XLK", "XLF", "XLE", "XLV", "XLI", "XLY", "XLP", "XLU", "XLB", "XLRE", "XLC",
    "EEM", "EFA", "VGK", "EWJ", "FXI", "INDA", "EWZ", "TUR", "KWEB",
    "TLT", "IEF", "SHY", "HYG", "LQD", "GLD", "SLV", "USO", "UNG"
  ])
];

const FOREX = symbols("FX_IDC", [
  "EURUSD", "GBPUSD", "USDJPY", "USDCHF", "USDCAD", "AUDUSD", "NZDUSD",
  "EURGBP", "EURJPY", "EURCHF", "EURCAD", "EURAUD", "EURNZD",
  "GBPJPY", "GBPCHF", "GBPCAD", "GBPAUD", "GBPNZD",
  "AUDJPY", "AUDCAD", "AUDCHF", "AUDNZD", "CADJPY", "CADCHF", "CHFJPY", "NZDJPY", "NZDCAD", "NZDCHF",
  "USDTRY", "EURTRY", "GBPTRY", "USDZAR", "USDMXN", "USDNOK", "USDSEK", "USDSGD", "USDHKD", "USDPLN"
]);

const MACRO = [
  "TVC:SPX", "NASDAQ:NDX", "TVC:DJI", "TVC:DXY", "TVC:VIX", "BIST:XU100", "BIST:XU030",
  "INDEX:DAX", "TVC:UKX", "TVC:NI225",
  "COMEX:GC1!", "COMEX:SI1!", "COMEX:HG1!", "NYMEX:CL1!", "NYMEX:NG1!", "NYMEX:RB1!",
  "NYMEX:PL1!", "CBOT:ZC1!", "CBOT:ZW1!", "CBOT:ZS1!", "CME_MINI:ES1!", "CME_MINI:NQ1!",
  "CME_MINI:RTY1!", "CBOT_MINI:YM1!", "ICEUS:DX1!"
];

const CRYPTO_FALLBACK = symbols("BINANCE", [
  "BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT", "ADAUSDT", "TRXUSDT",
  "AVAXUSDT", "LINKUSDT", "DOTUSDT", "MATICUSDT", "LTCUSDT", "BCHUSDT", "ATOMUSDT", "NEARUSDT",
  "APTUSDT", "ARBUSDT", "OPUSDT", "SUIUSDT", "INJUSDT", "FILUSDT", "ETCUSDT", "UNIUSDT",
  "AAVEUSDT", "ICPUSDT", "RENDERUSDT", "FETUSDT", "PEPEUSDT", "SHIBUSDT", "WIFUSDT", "BONKUSDT",
  "SEIUSDT", "TIAUSDT", "RUNEUSDT", "GRTUSDT", "ALGOUSDT", "VETUSDT", "XLMUSDT", "HBARUSDT"
]);

export const MARKET_CATEGORIES = Object.freeze({
  ALL: { label: "Tüm Piyasalar", symbols: [...BIST, ...US, ...CRYPTO_FALLBACK, ...FOREX, ...MACRO] },
  BIST: { label: "BIST", symbols: BIST },
  US: { label: "ABD", symbols: US },
  CRYPTO: { label: "Kripto", symbols: CRYPTO_FALLBACK },
  FOREX: { label: "Forex", symbols: FOREX },
  MACRO: { label: "Endeks / Emtia", symbols: MACRO }
});

export function getMarketUniverse(category, dynamic = []) {
  const key = String(category ?? "ALL").toUpperCase();
  const sources = Array.isArray(dynamic) ? { CRYPTO: dynamic } : (dynamic ?? {});
  const bist = unique(sources.BIST?.length > 0 ? [...BIST, ...sources.BIST] : BIST);
  const us = unique(sources.US?.length > 0 ? [...US, ...sources.US] : US);
  const crypto = unique(sources.CRYPTO?.length > 0 ? sources.CRYPTO : CRYPTO_FALLBACK);
  if (key === "BIST") return bist;
  if (key === "US") return us;
  if (key === "CRYPTO") return crypto;
  if (key === "ALL") return unique([...bist, ...us, ...crypto, ...FOREX, ...MACRO]);
  return [...(MARKET_CATEGORIES[key]?.symbols ?? MARKET_CATEGORIES.ALL.symbols)];
}

export function marketCategoryCounts(dynamic = []) {
  return {
    ALL: getMarketUniverse("ALL", dynamic).length,
    BIST: getMarketUniverse("BIST", dynamic).length,
    US: getMarketUniverse("US", dynamic).length,
    CRYPTO: getMarketUniverse("CRYPTO", dynamic).length,
    FOREX: FOREX.length,
    MACRO: MACRO.length
  };
}

function symbols(exchange, tickers) {
  return tickers.map((ticker) => `${exchange}:${ticker}`);
}

function unique(values) {
  return [...new Set(values)];
}

export const STATIC_UNIVERSES = Object.freeze({
  BIST: [...BIST],
  US: [...US],
  CRYPTO: [...CRYPTO_FALLBACK],
  FOREX: [...FOREX],
  MACRO: [...MACRO]
});
