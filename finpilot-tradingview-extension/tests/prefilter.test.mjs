import test from "node:test";
import assert from "node:assert/strict";
import { prescreenSymbols, rankDailyFrame } from "../lib/prefilter.js";

function dailyFrame(symbol, slope = 0.3, volume = 1_000_000) {
  return {
    requestedSymbol: symbol,
    provider: "TEST",
    bars: Array.from({ length: 120 }, (_, index) => {
      const close = 50 + index * slope + Math.sin(index / 4);
      return {
        time: 1_700_000_000_000 + index * 86_400_000,
        open: close - 0.2,
        high: close + 0.8,
        low: close - 0.8,
        close,
        volume
      };
    })
  };
}

test("daily prefilter scores healthy liquid trends", () => {
  const result = rankDailyFrame(dailyFrame("BIST:BIMAS"));
  assert.equal(result.symbol, "BIST:BIMAS");
  assert.ok(result.score >= 50);
  assert.ok(result.averageTurnover > 0);
});

test("daily prefilter ranks and limits the deep-analysis queue", async () => {
  const symbols = ["BIST:LOW", "BIST:MID", "BIST:HIGH"];
  const slopes = { "BIST:LOW": -0.2, "BIST:MID": 0.05, "BIST:HIGH": 0.35 };
  const progress = [];
  const result = await prescreenSymbols(symbols, {
    concurrency: 2,
    limit: 2,
    fetchDaily: async (symbol) => dailyFrame(symbol, slopes[symbol]),
    onProgress: async (state) => progress.push(state.completed)
  });
  assert.equal(result.candidates.length, 2);
  assert.deepEqual(new Set(result.candidates.map((item) => item.symbol)), new Set(["BIST:LOW", "BIST:HIGH"]));
  assert.ok(result.candidates.some((item) => item.bias === "LONG"));
  assert.ok(result.candidates.some((item) => item.bias === "SHORT"));
  assert.equal(result.completed, 3);
  assert.deepEqual(progress, [2, 3]);
});
