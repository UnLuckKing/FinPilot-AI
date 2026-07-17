import { randomUUID } from "node:crypto";
import type {
  AccountSnapshot,
  ConnectionStatus,
  Execution,
  ExecutionHandler,
  MarketCandle,
  OrderChanges,
  OrderRequest,
  OrderResponse,
  Position,
  ReconciliationResult,
  Unsubscribe
} from "@finpilot/core";
import type { BrokerAdapter } from "./broker-adapter.js";

export interface PaperBrokerOptions {
  initialCapital: number;
  commissionBps?: number;
  slippageBps?: number;
  maximumFillFractionOfCandle?: number;
  rejectionRate?: number;
  random?: () => number;
  clock?: () => Date;
}

export class PaperBroker implements BrokerAdapter {
  readonly name = "PaperBroker";
  readonly supportsNativeProtection = true;
  private cash: number;
  private readonly orders = new Map<string, OrderResponse>();
  private readonly positions = new Map<string, Position>();
  private readonly handlers = new Set<ExecutionHandler>();
  private readonly commissionBps: number;
  private readonly slippageBps: number;
  private readonly maximumFillFractionOfCandle: number;
  private readonly rejectionRate: number;
  private readonly random: () => number;
  private readonly clock: () => Date;
  private connected = false;

  constructor(options: PaperBrokerOptions) {
    if (!Number.isFinite(options.initialCapital) || options.initialCapital <= 0) {
      throw new Error("Kâğıt işlem sermayesi pozitif olmalıdır");
    }
    this.cash = options.initialCapital;
    this.commissionBps = options.commissionBps ?? 10;
    this.slippageBps = options.slippageBps ?? 8;
    this.maximumFillFractionOfCandle = options.maximumFillFractionOfCandle ?? 0.02;
    this.rejectionRate = options.rejectionRate ?? 0;
    this.random = options.random ?? Math.random;
    this.clock = options.clock ?? (() => new Date());
  }

  async connect(): Promise<ConnectionStatus> {
    this.connected = true;
    return this.status("Kâğıt işlem simülatörü bağlı");
  }

  async getAccount(): Promise<AccountSnapshot> {
    const marketValue = [...this.positions.values()].reduce((sum, position) => sum + position.quantity * position.lastPrice, 0);
    return {
      currency: "TRY",
      cash: round(this.cash),
      availableCash: round(this.availableCash()),
      equity: round(this.cash + marketValue),
      updatedAt: this.clock().toISOString()
    };
  }

  async getPositions(): Promise<Position[]> {
    return structuredClone([...this.positions.values()]);
  }

  async getOrders(): Promise<OrderResponse[]> {
    return structuredClone([...this.orders.values()]);
  }

  async placeOrder(request: OrderRequest): Promise<OrderResponse> {
    this.assertConnected();
    const duplicate = [...this.orders.values()].find((order) => order.clientOrderId === request.clientOrderId);
    if (duplicate) return structuredClone(duplicate);

    const now = this.clock().toISOString();
    const invalidReason = this.validateRequest(request);
    const randomlyRejected = this.random() < this.rejectionRate;
    const response: OrderResponse = {
      ...structuredClone(request),
      brokerOrderId: `paper-${randomUUID()}`,
      status: invalidReason || randomlyRejected ? "REJECTED" : "ACCEPTED",
      filledQuantity: 0,
      averageFillPrice: null,
      rejectionReason: invalidReason ?? (randomlyRejected ? "Yapılandırılmış kâğıt ret senaryosu" : null),
      createdAt: now,
      updatedAt: now
    };
    this.orders.set(response.brokerOrderId, response);
    return structuredClone(response);
  }

  async cancelOrder(orderId: string): Promise<void> {
    const order = this.requireOrder(orderId);
    if (["FILLED", "CANCELLED", "REJECTED", "EXPIRED"].includes(order.status)) return;
    order.status = "CANCELLED";
    order.updatedAt = this.clock().toISOString();
  }

  async replaceOrder(orderId: string, changes: OrderChanges): Promise<OrderResponse> {
    const order = this.requireOrder(orderId);
    if (!["ACCEPTED", "PARTIALLY_FILLED"].includes(order.status)) throw new Error("Yalnız açık emir değiştirilebilir");
    if (changes.quantity !== undefined) {
      if (!Number.isInteger(changes.quantity) || changes.quantity < order.filledQuantity) throw new Error("Yeni adet geçersiz");
      order.quantity = changes.quantity;
    }
    if (changes.limitPrice !== undefined) order.limitPrice = positive(changes.limitPrice, "limitPrice");
    if (changes.stopPrice !== undefined) order.stopPrice = positive(changes.stopPrice, "stopPrice");
    if (changes.expiresAt !== undefined) order.expiresAt = changes.expiresAt;
    order.updatedAt = this.clock().toISOString();
    return structuredClone(order);
  }

  async getOrderStatus(orderId: string): Promise<OrderResponse> {
    return structuredClone(this.requireOrder(orderId));
  }

  async streamExecutions(handler: ExecutionHandler): Promise<Unsubscribe> {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async reconcile(): Promise<ReconciliationResult> {
    const positions = await this.getPositions();
    const orders = await this.getOrders();
    const conflicts: string[] = [];
    for (const position of positions) {
      if (position.quantity <= 0) conflicts.push(`${position.symbol}: geçersiz pozisyon adedi`);
    }
    return {
      safe: conflicts.length === 0,
      account: await this.getAccount(),
      positions,
      orders,
      conflicts,
      checkedAt: this.clock().toISOString()
    };
  }

  setCapital(value: number): void {
    if (!Number.isFinite(value) || value <= 0) throw new Error("Kâğıt sermayesi pozitif olmalıdır");
    const openOrders = [...this.orders.values()].some((order) => ["PENDING", "ACCEPTED", "PARTIALLY_FILLED"].includes(order.status));
    if (this.positions.size || openOrders) throw new Error("Açık emir veya pozisyon varken kâğıt sermayesi değiştirilemez");
    this.cash = value;
  }

  async processCandle(candle: MarketCandle): Promise<Execution[]> {
    this.assertConnected();
    const now = this.clock();
    const position = this.positions.get(candle.symbol);
    if (position) {
      position.lastPrice = candle.close;
      position.unrealisedPnl = round((candle.close - position.averagePrice) * position.quantity);
    }

    const executions: Execution[] = [];
    const processedThisCandle = new Set<string>();
    // Gerçekleşme dinleyicisi aynı mum içinde koruma emri ekleyebilir. Yeni stoplar da aynı
    // mumda, stop önce olacak biçimde işlenir; giriş mumu riski iyimser bırakılmaz.
    for (let pass = 0; pass < 4; pass += 1) {
      const active = [...this.orders.values()]
        .filter((order) => order.symbol === candle.symbol && !processedThisCandle.has(order.brokerOrderId) && ["ACCEPTED", "PARTIALLY_FILLED"].includes(order.status))
        .sort((left, right) => orderPriority(left) - orderPriority(right) || left.createdAt.localeCompare(right.createdAt));
      if (!active.length) break;
      for (const order of active) {
        if (!["ACCEPTED", "PARTIALLY_FILLED"].includes(order.status)) continue;
        processedThisCandle.add(order.brokerOrderId);
        if (order.expiresAt && new Date(order.expiresAt).getTime() <= now.getTime()) {
          order.status = "EXPIRED";
          order.updatedAt = now.toISOString();
          continue;
        }
        const price = this.executionPrice(order, candle);
        if (price === null) continue;
        const remaining = order.quantity - order.filledQuantity;
        const volumeCapacity = Math.max(1, Math.floor(candle.volume * this.maximumFillFractionOfCandle));
        const fillQuantity = Math.min(remaining, volumeCapacity);
        if (order.side === "BUY" && price * fillQuantity * (1 + this.commissionBps / 10_000) > this.cashAvailableExcluding(order.brokerOrderId) + 0.001) {
          order.status = "REJECTED";
          order.rejectionReason = "Kullanılabilir nakit yetersiz";
          order.updatedAt = now.toISOString();
          continue;
        }
        if (order.side === "SELL" && (this.positions.get(order.symbol)?.quantity ?? 0) < fillQuantity) {
          order.status = "REJECTED";
          order.rejectionReason = "Satılabilir pozisyon yetersiz";
          order.updatedAt = now.toISOString();
          continue;
        }
        const execution = this.applyFill(order, fillQuantity, price, now);
        executions.push(execution);
        for (const handler of this.handlers) await handler(structuredClone(execution));
      }
    }
    return executions;
  }

  private applyFill(order: OrderResponse, quantity: number, price: number, now: Date): Execution {
    const gross = price * quantity;
    const commission = gross * this.commissionBps / 10_000;
    const previousFilled = order.filledQuantity;
    order.filledQuantity += quantity;
    order.averageFillPrice = order.averageFillPrice === null
      ? price
      : ((order.averageFillPrice * previousFilled) + price * quantity) / order.filledQuantity;
    order.status = order.filledQuantity === order.quantity ? "FILLED" : "PARTIALLY_FILLED";
    order.updatedAt = now.toISOString();

    if (order.side === "BUY") {
      this.cash -= gross + commission;
      const current = this.positions.get(order.symbol);
      if (current) {
        const totalQuantity = current.quantity + quantity;
        current.averagePrice = ((current.averagePrice * current.quantity) + price * quantity) / totalQuantity;
        current.quantity = totalQuantity;
        current.lastPrice = price;
        current.unrealisedPnl = 0;
      } else {
        this.positions.set(order.symbol, {
          symbol: order.symbol,
          quantity,
          averagePrice: price,
          lastPrice: price,
          unrealisedPnl: 0,
          openedAt: now.toISOString(),
          stopPrice: numericMetadata(order, "stopPrice"),
          target1: numericMetadata(order, "target1"),
          target2: numericMetadata(order, "target2"),
          target1Completed: false
        });
      }
    } else {
      this.cash += gross - commission;
      const current = this.positions.get(order.symbol);
      if (!current) throw new Error("Pozisyon olmadan satış gerçekleşti");
      current.quantity -= quantity;
      current.lastPrice = price;
      current.unrealisedPnl = round((price - current.averagePrice) * current.quantity);
      if (current.quantity === 0) this.positions.delete(order.symbol);
    }

    return {
      executionId: `exec-${randomUUID()}`,
      brokerOrderId: order.brokerOrderId,
      symbol: order.symbol,
      side: order.side,
      quantity,
      price,
      commission: round(commission),
      executedAt: now.toISOString()
    };
  }

  private executionPrice(order: OrderResponse, candle: MarketCandle): number | null {
    const slip = this.slippageBps / 10_000;
    if (order.type === "MARKET") return round(order.side === "BUY" ? candle.open * (1 + slip) : candle.open * (1 - slip));
    if (order.type === "LIMIT") {
      if (order.limitPrice === undefined) return null;
      if (order.side === "BUY" && candle.low <= order.limitPrice) return round(Math.min(order.limitPrice, candle.open * (1 + slip)));
      if (order.side === "SELL" && candle.high >= order.limitPrice) return round(Math.max(order.limitPrice, candle.open * (1 - slip)));
      return null;
    }
    if (order.type === "STOP" || order.type === "STOP_LIMIT") {
      if (order.stopPrice === undefined) return null;
      const triggered = order.side === "SELL" ? candle.low <= order.stopPrice : candle.high >= order.stopPrice;
      if (!triggered) return null;
      const gapPrice = order.side === "SELL"
        ? Math.min(order.stopPrice, candle.open) * (1 - slip)
        : Math.max(order.stopPrice, candle.open) * (1 + slip);
      if (order.type === "STOP_LIMIT" && order.limitPrice !== undefined) {
        const canFill = order.side === "SELL" ? gapPrice >= order.limitPrice : gapPrice <= order.limitPrice;
        if (!canFill) return null;
      }
      return round(gapPrice);
    }
    return null;
  }

  private validateRequest(order: OrderRequest): string | null {
    if (!Number.isInteger(order.quantity) || order.quantity <= 0) return "Adet pozitif tam sayı olmalıdır";
    if (!/^[A-Z0-9]{2,20}$/.test(order.symbol)) return "Sembol geçersiz";
    if (order.type === "LIMIT" && order.limitPrice === undefined) return "Limit emrinde limit fiyatı zorunlu";
    if ((order.type === "STOP" || order.type === "STOP_LIMIT") && order.stopPrice === undefined) return "Stop emrinde stop fiyatı zorunlu";
    if (order.side === "SELL" && (this.positions.get(order.symbol)?.quantity ?? 0) < order.quantity) return "Açığa satış desteklenmiyor";
    return null;
  }

  private availableCash(): number {
    const reserved = [...this.orders.values()]
      .filter((order) => order.side === "BUY" && ["ACCEPTED", "PARTIALLY_FILLED"].includes(order.status))
      .reduce((sum, order) => sum + (order.quantity - order.filledQuantity) * (order.limitPrice ?? 0), 0);
    return Math.max(0, this.cash - reserved);
  }

  private cashAvailableExcluding(brokerOrderId: string): number {
    const reservedByOthers = [...this.orders.values()]
      .filter((order) => order.brokerOrderId !== brokerOrderId && order.side === "BUY" && ["ACCEPTED", "PARTIALLY_FILLED"].includes(order.status))
      .reduce((sum, order) => sum + (order.quantity - order.filledQuantity) * (order.limitPrice ?? 0), 0);
    return Math.max(0, this.cash - reservedByOthers);
  }

  private requireOrder(id: string): OrderResponse {
    const order = this.orders.get(id);
    if (!order) throw new Error(`Emir bulunamadı: ${id}`);
    return order;
  }

  private assertConnected(): void {
    if (!this.connected) throw new Error("PaperBroker bağlı değil");
  }

  private status(message: string): ConnectionStatus {
    return { connected: this.connected, adapter: this.name, reconciliation: "FULL", message, checkedAt: this.clock().toISOString() };
  }
}

function positive(value: number, field: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${field} pozitif olmalıdır`);
  return value;
}

function numericMetadata(order: OrderResponse, key: string): number | null {
  const value = order.metadata?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

function orderPriority(order: OrderResponse): number {
  if (order.side === "BUY") return 0;
  if (order.type === "STOP" || order.type === "STOP_LIMIT") return 1;
  return 2;
}
