import { beforeEach, describe, expect, it } from "vitest";
import { PaperBroker } from "@finpilot/brokers";

describe("PaperBroker emir yaşam döngüsü", () => {
  let broker: PaperBroker;
  beforeEach(async () => {
    broker = new PaperBroker({ initialCapital: 100_000, commissionBps: 10, slippageBps: 0, maximumFillFractionOfCandle: 0.1, random: () => 0.5 });
    await broker.connect();
  });

  it("kabulü gerçekleşme saymaz ve mum limiti görürse doldurur", async () => {
    const order = await broker.placeOrder({ clientOrderId: "one", signalId: "signal-one", symbol: "ASELS", side: "BUY", type: "LIMIT", quantity: 10, limitPrice: 100, timeInForce: "DAY" });
    expect(order.status).toBe("ACCEPTED");
    expect((await broker.getPositions())).toHaveLength(0);
    await broker.processCandle({ symbol: "ASELS", time: new Date().toISOString(), open: 101, high: 102, low: 99, close: 100, volume: 1000 });
    expect((await broker.getOrderStatus(order.brokerOrderId)).status).toBe("FILLED");
    expect((await broker.getPositions())[0]?.quantity).toBe(10);
  });

  it("düşük mum hacminde kısmi gerçekleşme yapar", async () => {
    const order = await broker.placeOrder({ clientOrderId: "partial", signalId: "signal-partial", symbol: "THYAO", side: "BUY", type: "LIMIT", quantity: 25, limitPrice: 100, timeInForce: "DAY" });
    await broker.processCandle({ symbol: "THYAO", time: new Date().toISOString(), open: 100, high: 101, low: 99, close: 100, volume: 100 });
    const status = await broker.getOrderStatus(order.brokerOrderId);
    expect(status.status).toBe("PARTIALLY_FILLED");
    expect(status.filledQuantity).toBe(10);
  });

  it("aynı clientOrderId ağ tekrarında ikinci emir oluşturmaz", async () => {
    const request = { clientOrderId: "duplicate", signalId: "signal-duplicate", symbol: "GARAN", side: "BUY" as const, type: "LIMIT" as const, quantity: 1, limitPrice: 100, timeInForce: "DAY" as const };
    const first = await broker.placeOrder(request);
    const second = await broker.placeOrder(request);
    expect(second.brokerOrderId).toBe(first.brokerOrderId);
    expect(await broker.getOrders()).toHaveLength(1);
  });

  it("süre dolmuş emri doldurmaz", async () => {
    let now = new Date("2026-07-17T07:00:00Z");
    const timed = new PaperBroker({ initialCapital: 100_000, clock: () => now, random: () => 0.5 });
    await timed.connect();
    const order = await timed.placeOrder({ clientOrderId: "expired", signalId: "signal-expired", symbol: "TUPRS", side: "BUY", type: "LIMIT", quantity: 1, limitPrice: 100, timeInForce: "DAY", expiresAt: "2026-07-17T07:01:00Z" });
    now = new Date("2026-07-17T07:02:00Z");
    await timed.processCandle({ symbol: "TUPRS", time: now.toISOString(), open: 100, high: 101, low: 99, close: 100, volume: 1000 });
    expect((await timed.getOrderStatus(order.brokerOrderId)).status).toBe("EXPIRED");
  });

  it("stop boşluğunda stop fiyatından daha kötü gerçekleşmeyi simüle eder", async () => {
    await broker.placeOrder({ clientOrderId: "buy-gap", signalId: "gap", symbol: "KCHOL", side: "BUY", type: "LIMIT", quantity: 10, limitPrice: 100, timeInForce: "DAY" });
    await broker.processCandle({ symbol: "KCHOL", time: new Date().toISOString(), open: 100, high: 101, low: 99, close: 100, volume: 1000 });
    const stop = await broker.placeOrder({ clientOrderId: "stop-gap", signalId: "gap", symbol: "KCHOL", side: "SELL", type: "STOP", quantity: 10, stopPrice: 95, timeInForce: "DAY", reduceOnly: true });
    await broker.processCandle({ symbol: "KCHOL", time: new Date().toISOString(), open: 90, high: 91, low: 88, close: 89, volume: 1000 });
    expect((await broker.getOrderStatus(stop.brokerOrderId)).averageFillPrice).toBe(90);
  });

  it("giriş gerçekleşince eklenen stopu aynı mumda muhafazakâr biçimde işler", async () => {
    await broker.streamExecutions(async (execution) => {
      if (execution.side !== "BUY") return;
      await broker.placeOrder({ clientOrderId: "same-bar-stop", signalId: "same-bar", symbol: "FROTO", side: "SELL", type: "STOP", quantity: execution.quantity, stopPrice: 95, timeInForce: "DAY", reduceOnly: true });
    });
    await broker.placeOrder({ clientOrderId: "same-bar-buy", signalId: "same-bar", symbol: "FROTO", side: "BUY", type: "LIMIT", quantity: 5, limitPrice: 100, timeInForce: "DAY" });
    const executions = await broker.processCandle({ symbol: "FROTO", time: new Date().toISOString(), open: 100, high: 102, low: 90, close: 91, volume: 1000 });
    expect(executions.map((execution) => execution.side)).toEqual(["BUY", "SELL"]);
    expect(await broker.getPositions()).toHaveLength(0);
  });

  it("açığa satışı reddeder; açık emri iptal ve değiştirir", async () => {
    const sell = await broker.placeOrder({ clientOrderId: "naked", signalId: "naked", symbol: "SISE", side: "SELL", type: "MARKET", quantity: 1, timeInForce: "DAY" });
    expect(sell.status).toBe("REJECTED");
    const buy = await broker.placeOrder({ clientOrderId: "modify", signalId: "modify", symbol: "SISE", side: "BUY", type: "LIMIT", quantity: 2, limitPrice: 90, timeInForce: "DAY" });
    expect((await broker.replaceOrder(buy.brokerOrderId, { limitPrice: 91 })).limitPrice).toBe(91);
    await broker.cancelOrder(buy.brokerOrderId);
    expect((await broker.getOrderStatus(buy.brokerOrderId)).status).toBe("CANCELLED");
  });

  it("yeniden başlatma öncesi mutabakat için hesap/emir/pozisyon görüntüsü üretir", async () => {
    const result = await broker.reconcile();
    expect(result.safe).toBe(true);
    expect(result.account.equity).toBe(100_000);
  });

  it("açık emir yokken kâğıt sermayesini gerçekten günceller", async () => {
    broker.setCapital(50_000);
    expect((await broker.getAccount()).equity).toBe(50_000);
  });
});
