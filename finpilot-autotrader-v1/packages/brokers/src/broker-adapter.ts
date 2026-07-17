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

export interface BrokerAdapter {
  readonly name: string;
  readonly supportsNativeProtection: boolean;
  connect(): Promise<ConnectionStatus>;
  getAccount(): Promise<AccountSnapshot>;
  getPositions(): Promise<Position[]>;
  getOrders(): Promise<OrderResponse[]>;
  placeOrder(order: OrderRequest): Promise<OrderResponse>;
  cancelOrder(orderId: string): Promise<void>;
  replaceOrder(orderId: string, changes: OrderChanges): Promise<OrderResponse>;
  getOrderStatus(orderId: string): Promise<OrderResponse>;
  streamExecutions(handler: ExecutionHandler): Promise<Unsubscribe>;
  reconcile(): Promise<ReconciliationResult>;
}
