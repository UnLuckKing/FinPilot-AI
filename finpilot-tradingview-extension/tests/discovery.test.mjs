import test from "node:test";
import assert from "node:assert/strict";
import {
  discoverKapBistSymbols,
  discoverYahooUsSymbols,
  parseKapBistSymbols,
  parseYahooScreenerSymbols
} from "../lib/discovery.js";

test("KAP embedded company data becomes a deduplicated BIST universe", () => {
  const html = String.raw`
    \"stockCode\":\"BIMAS\"
    \"stockCode\":\"AKM, AKMEN\"
    \"stockCode\":\"BIMAS\"
  `;
  assert.deepEqual(parseKapBistSymbols(html), [
    "BIST:BIMAS",
    "BIST:AKM",
    "BIST:AKMEN"
  ]);
});

test("KAP discovery rejects suspiciously short company pages", async () => {
  const fetchFn = async () => ({
    ok: true,
    async text() {
      return String.raw`\"stockCode\":\"BIMAS\"`;
    }
  });
  await assert.rejects(() => discoverKapBistSymbols({ fetchFn }), /beklenenden kısa/u);
});

test("Yahoo screen results map major US exchanges", () => {
  const payload = {
    finance: {
      result: [{
        quotes: [
          { symbol: "AAPL", quoteType: "EQUITY", exchange: "NMS", fullExchangeName: "NasdaqGS" },
          { symbol: "BRK-B", quoteType: "EQUITY", exchange: "NYQ", fullExchangeName: "NYSE" },
          { symbol: "SPY", quoteType: "ETF", exchange: "PCX", fullExchangeName: "NYSEArca" },
          { symbol: "BTC-USD", quoteType: "CRYPTOCURRENCY", exchange: "CCC" }
        ]
      }]
    }
  };
  assert.deepEqual(parseYahooScreenerSymbols(payload), [
    "NASDAQ:AAPL",
    "NYSE:BRK.B",
    "AMEX:SPY"
  ]);
});

test("US discovery unions several automatic screens", async () => {
  const fetchFn = async (url) => ({
    ok: true,
    async json() {
      const screen = new URL(url).searchParams.get("scrIds");
      return {
        finance: {
          result: [{
            quotes: Array.from({ length: 35 }, (_, index) => ({
              symbol: `${screen.slice(0, 2).toUpperCase()}${index}`,
              quoteType: "EQUITY",
              exchange: index % 2 ? "NYQ" : "NMS"
            }))
          }]
        }
      };
    }
  });
  const symbols = await discoverYahooUsSymbols({
    fetchFn,
    screens: ["most_actives", "day_gainers"],
    limit: 100
  });
  assert.ok(symbols.length >= 60);
  assert.ok(symbols.some((symbol) => symbol.startsWith("NASDAQ:")));
  assert.ok(symbols.some((symbol) => symbol.startsWith("NYSE:")));
});
