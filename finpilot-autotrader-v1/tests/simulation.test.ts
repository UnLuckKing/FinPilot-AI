import { describe, expect, it } from "vitest";
import { PaperBroker } from "@finpilot/brokers";

describe("sentetik mum simülasyonu", () => {
  it("600 mumda gerçek adaptöre emir göndermeden hesap durumunu korur", async () => {
    const broker = new PaperBroker({ initialCapital: 100_000, random: () => 0.5, maximumFillFractionOfCandle: 0.05 });
    await broker.connect();
    let price = 100;
    for (let index = 0; index < 600; index += 1) {
      const change = Math.sin(index / 17) * 0.4 + Math.cos(index / 31) * 0.2;
      const open = price;
      price = Math.max(20, price + change);
      await broker.processCandle({
        symbol: "ASELS",
        time: new Date(Date.UTC(2026, 0, 1, 7, index * 15)).toISOString(),
        open,
        high: Math.max(open, price) + 0.3,
        low: Math.min(open, price) - 0.3,
        close: price,
        volume: 100_000 + index * 10
      });
    }
    const account = await broker.getAccount();
    expect(account.equity).toBe(100_000);
    expect(await broker.getOrders()).toHaveLength(0);
  });
});
