import { randomUUID } from "node:crypto";
import type {
  AccountSnapshot,
  ConnectionStatus,
  ExecutionHandler,
  OrderChanges,
  OrderRequest,
  OrderResponse,
  Position,
  ReconciliationResult,
  Unsubscribe
} from "@finpilot/core";
import type { BrokerAdapter } from "./broker-adapter.js";

type TemplateValue = string | number | boolean | null | TemplateValue[] | { [key: string]: TemplateValue };

export interface OsmanliWebhookOptions {
  endpoint: string;
  officialTemplate: Record<string, TemplateValue>;
  bearerToken?: string;
  fetcher?: typeof fetch;
}

const allowedVariables = new Set([
  "side", "symbol", "quantity", "limitPrice", "stopPrice", "target1", "target2", "validity", "clientOrderId"
]);

export class OsmanliWebhookAdapter implements BrokerAdapter {
  readonly name = "OsmanliWebhookAdapter";
  readonly supportsNativeProtection = false;
  private readonly fetcher: typeof fetch;
  private readonly orders = new Map<string, OrderResponse>();

  constructor(private readonly options: OsmanliWebhookOptions) {
    const url = new URL(options.endpoint);
    if (url.protocol !== "https:") throw new Error("Canlı webhook adresi HTTPS olmalıdır");
    validateTemplate(options.officialTemplate);
    this.fetcher = options.fetcher ?? fetch;
  }

  async connect(): Promise<ConnectionStatus> {
    return this.connection("Resmî komut şablonu doğrulandı; gerçekleşme bilgisi sınırlı");
  }

  async getAccount(): Promise<AccountSnapshot> {
    throw new Error("Resmî webhook iş akışı hesap bakiyesi sağlamıyor");
  }

  async getPositions(): Promise<Position[]> {
    return [];
  }

  async getOrders(): Promise<OrderResponse[]> {
    return structuredClone([...this.orders.values()]);
  }

  async placeOrder(order: OrderRequest): Promise<OrderResponse> {
    const target1 = numeric(order.metadata?.target1);
    const target2 = numeric(order.metadata?.target2);
    const variables: Record<string, string | number> = {
      side: order.side,
      symbol: order.symbol,
      quantity: order.quantity,
      limitPrice: order.limitPrice ?? "",
      stopPrice: order.stopPrice ?? "",
      target1: target1 ?? "",
      target2: target2 ?? "",
      validity: order.timeInForce,
      clientOrderId: order.clientOrderId
    };
    const body = renderTemplate(this.options.officialTemplate, variables);
    const response = await this.fetcher(this.options.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.options.bearerToken ? { authorization: `Bearer ${this.options.bearerToken}` } : {})
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8_000)
    });
    const now = new Date().toISOString();
    const result: OrderResponse = {
      ...structuredClone(order),
      brokerOrderId: response.headers.get("x-order-id") ?? `limited-${randomUUID()}`,
      status: response.ok ? "ACCEPTED" : "REJECTED",
      filledQuantity: 0,
      averageFillPrice: null,
      rejectionReason: response.ok ? null : `Webhook HTTP ${response.status}`,
      createdAt: now,
      updatedAt: now
    };
    this.orders.set(result.brokerOrderId, result);
    return structuredClone(result);
  }

  async cancelOrder(_orderId: string): Promise<void> {
    throw new Error("İptal işlemi ancak içe aktarılan resmî şablon desteklerse ayrıca yapılandırılabilir");
  }

  async replaceOrder(_orderId: string, _changes: OrderChanges): Promise<OrderResponse> {
    throw new Error("Emir değiştirme resmî webhook iş akışında doğrulanmadı");
  }

  async getOrderStatus(orderId: string): Promise<OrderResponse> {
    const order = this.orders.get(orderId);
    if (!order) throw new Error("Emir bulunamadı");
    return structuredClone(order);
  }

  async streamExecutions(_handler: ExecutionHandler): Promise<Unsubscribe> {
    return () => undefined;
  }

  async reconcile(): Promise<ReconciliationResult> {
    return {
      safe: false,
      account: { currency: "TRY", cash: 0, availableCash: 0, equity: 0, updatedAt: new Date().toISOString() },
      positions: [],
      orders: await this.getOrders(),
      conflicts: ["Webhook adaptörü gerçek hesap/pozisyon/gerçekleşme mutabakatı sağlayamıyor"],
      checkedAt: new Date().toISOString()
    };
  }

  private connection(message: string): ConnectionStatus {
    return { connected: true, adapter: this.name, reconciliation: "LIMITED", message, checkedAt: new Date().toISOString() };
  }
}

export function validateTemplate(template: Record<string, TemplateValue>): void {
  const serialized = JSON.stringify(template);
  const matches = serialized.matchAll(/{{\s*([A-Za-z0-9_]+)\s*}}/g);
  for (const match of matches) {
    const variable = match[1];
    if (!variable || !allowedVariables.has(variable)) throw new Error(`Şablonda desteklenmeyen değişken: ${variable ?? "boş"}`);
  }
  if (!serialized.includes("{{symbol}}") || !serialized.includes("{{side}}") || !serialized.includes("{{quantity}}")) {
    throw new Error("Resmî şablonda symbol, side ve quantity alanları bulunmalıdır");
  }
}

export function renderTemplate(
  template: Record<string, TemplateValue>,
  variables: Record<string, string | number>
): Record<string, TemplateValue> {
  const render = (value: TemplateValue): TemplateValue => {
    if (typeof value === "string") {
      const exact = value.match(/^{{\s*([A-Za-z0-9_]+)\s*}}$/);
      if (exact?.[1]) return variables[exact[1]] ?? "";
      return value.replace(/{{\s*([A-Za-z0-9_]+)\s*}}/g, (_whole, key: string) => String(variables[key] ?? ""));
    }
    if (Array.isArray(value)) return value.map(render);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, render(nested)]));
    return value;
  };
  return render(template) as Record<string, TemplateValue>;
}

function numeric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
