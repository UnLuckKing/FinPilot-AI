import { describe, expect, it } from "vitest";
import { calculateBudget, calculateHoldings, recommendedAllocation } from "./calculations";
import { demoState } from "./demo-data";

describe("financial calculations", () => {
  it("keeps budget limits ordered and non-negative", () => {
    const result = calculateBudget(demoState.profile);
    expect(result.safe).toBeGreaterThanOrEqual(0);
    expect(result.safe).toBeLessThanOrEqual(result.balanced);
    expect(result.balanced).toBeLessThanOrEqual(result.upper);
  });

  it("calculates transaction-based holdings", () => {
    const holdings = calculateHoldings(demoState);
    expect(holdings.length).toBeGreaterThan(3);
    expect(holdings.find((h) => h.asset.id === "thyao")?.quantity).toBe(32);
  });

  it("always recommends a 100 percent allocation", () => {
    const result = recommendedAllocation(demoState.profile);
    expect(Object.values(result).reduce((a, b) => a + b, 0)).toBe(100);
  });
});
