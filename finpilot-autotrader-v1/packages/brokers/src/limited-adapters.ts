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

export class DisabledOfficialIntegrationAdapter implements BrokerAdapter {
  readonly supportsNativeProtection = false;

  constructor(readonly name: "MatriksIQAdapter" | "IdealAdapter", private readonly reason: string) {}

  async connect(): Promise<ConnectionStatus> {
    return { connected: false, adapter: this.name, reconciliation: "NONE", message: this.reason, checkedAt: new Date().toISOString() };
  }
  async getAccount(): Promise<AccountSnapshot> { return this.unsupported(); }
  async getPositions(): Promise<Position[]> { return this.unsupported(); }
  async getOrders(): Promise<OrderResponse[]> { return this.unsupported(); }
  async placeOrder(_order: OrderRequest): Promise<OrderResponse> { return this.unsupported(); }
  async cancelOrder(_orderId: string): Promise<void> { return this.unsupported(); }
  async replaceOrder(_orderId: string, _changes: OrderChanges): Promise<OrderResponse> { return this.unsupported(); }
  async getOrderStatus(_orderId: string): Promise<OrderResponse> { return this.unsupported(); }
  async streamExecutions(_handler: ExecutionHandler): Promise<Unsubscribe> { return this.unsupported(); }
  async reconcile(): Promise<ReconciliationResult> { return this.unsupported(); }

  private unsupported(): never {
    throw new Error(`${this.name} etkin değil: ${this.reason}`);
  }
}
