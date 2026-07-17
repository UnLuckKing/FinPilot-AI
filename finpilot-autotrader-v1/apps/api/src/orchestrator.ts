import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { BrokerAdapter } from "@finpilot/brokers";
import {
  createTradePlan,
  defaultStrategyConfig,
  deriveRiskDecision,
  evaluateLongSetup,
  isStale,
  type ConnectionStatus,
  type DailyRiskSnapshot,
  type DashboardSnapshot,
  type Execution,
  type MarketCandle,
  type OrderRequest,
  type OrderResponse,
  type ParsedTradingViewSignal,
  type Position,
  type RiskDecision,
  type TradePlan,
  type TradingMode
} from "@finpilot/core";
import type { AppEnv } from "./env.js";
import type { ExchangeCalendar } from "./exchange-calendar.js";
import type { RestrictionService } from "./restrictions.js";
import type { SafeNotification } from "./notifier.js";

const seedSymbols = [
  "AKBNK", "ARCLK", "ASELS", "BIMAS", "EKGYO", "ENKAI", "EREGL", "FROTO", "GARAN", "GUBRF",
  "HEKTS", "ISCTR", "KCHOL", "KOZAA", "KOZAL", "KRDMD", "MGROS", "PETKM", "PGSUS", "SAHOL",
  "SASA", "SISE", "TCELL", "THYAO", "TOASO", "TUPRS", "YKBNK", "XU100", "HEDEF", "IEYHO"
];

export interface OrchestratorOptions {
  prisma: PrismaClient;
  broker: BrokerAdapter;
  restrictions: RestrictionService;
  calendar: ExchangeCalendar;
  env: AppEnv;
  broadcast?: (snapshot: DashboardSnapshot) => void;
  notify?: (notification: SafeNotification) => Promise<void>;
  clock?: () => Date;
}

export interface SignalOutcome {
  state: "ACCEPTED" | "REJECTED" | "DUPLICATE" | "CLOSE_SENT";
  reason: string;
  order?: OrderResponse;
  plan?: TradePlan;
}

export class TradingOrchestrator {
  private readonly prisma: PrismaClient;
  private readonly broker: BrokerAdapter;
  private readonly restrictions: RestrictionService;
  private readonly calendar: ExchangeCalendar;
  private readonly env: AppEnv;
  private readonly clock: () => Date;
  private readonly broadcast: ((snapshot: DashboardSnapshot) => void) | undefined;
  private readonly notify: ((notification: SafeNotification) => Promise<void>) | undefined;
  private connection: ConnectionStatus = {
    connected: false,
    adapter: "Başlatılıyor",
    reconciliation: "NONE",
    message: "Bağlantı bekleniyor",
    checkedAt: new Date(0).toISOString()
  };
  private lastWebhookAt: string | null = null;
  private sessionCloseRequestedDate: string | null = null;
  private lastReconciliationSafe: boolean | null = null;

  constructor(options: OrchestratorOptions) {
    this.prisma = options.prisma;
    this.broker = options.broker;
    this.restrictions = options.restrictions;
    this.calendar = options.calendar;
    this.env = options.env;
    this.clock = options.clock ?? (() => new Date());
    this.broadcast = options.broadcast;
    this.notify = options.notify;
  }

  async startup(): Promise<void> {
    await this.prisma.userConfiguration.upsert({
      where: { id: "singleton" },
      create: {
        id: "singleton",
        tradingMode: "PAPER",
        capitalTry: 100_000,
        selectedBroker: this.broker.name,
        killSwitchActive: false,
        liveEnabled: false,
        watchlistJson: JSON.stringify(seedSymbols)
      },
      update: { selectedBroker: this.broker.name }
    });
    await this.prisma.strategyVersion.upsert({
      where: { version: defaultStrategyConfig.version },
      create: { version: defaultStrategyConfig.version, configJson: JSON.stringify(defaultStrategyConfig), active: true },
      update: { configJson: JSON.stringify(defaultStrategyConfig), active: true }
    });
    for (const code of seedSymbols) {
      await this.prisma.symbol.upsert({
        where: { code },
        create: { code, exchange: "BIST", enabled: code !== "XU100" },
        update: {}
      });
    }
    await this.restrictions.load();
    await this.calendar.load();
    const lastWebhook = await this.prisma.webhookEvent.findFirst({ orderBy: { receivedAt: "desc" } });
    this.lastWebhookAt = lastWebhook?.receivedAt.toISOString() ?? null;
    this.connection = await this.broker.connect();
    const reconciliation = await this.broker.reconcile();
    this.lastReconciliationSafe = reconciliation.safe;
    const date = dateKey(this.clock());
    const account = reconciliation.account.equity > 0 ? reconciliation.account : await this.safeAccount();
    await this.prisma.dailyRiskState.upsert({
      where: { date },
      create: { date, openingCapital: account.equity || 100_000, reconciled: reconciliation.safe },
      update: { reconciled: reconciliation.safe }
    });
    await this.prisma.brokerConnection.upsert({
      where: { adapter: this.broker.name },
      create: {
        adapter: this.broker.name,
        status: this.connection.connected ? "CONNECTED" : "DISCONNECTED",
        reconciliationLevel: this.connection.reconciliation,
        lastConnectedAt: this.connection.connected ? this.clock() : null,
        lastReconciledAt: reconciliation.safe ? this.clock() : null
      },
      update: {
        status: this.connection.connected ? "CONNECTED" : "DISCONNECTED",
        reconciliationLevel: this.connection.reconciliation,
        lastConnectedAt: this.connection.connected ? this.clock() : null,
        lastReconciledAt: reconciliation.safe ? this.clock() : null
      }
    });
    await this.syncBrokerState();
    await this.broker.streamExecutions((execution) => this.onExecution(execution));
    await this.audit("SYSTEM", "STARTUP_RECONCILIATION", "BrokerConnection", this.broker.name, {
      safe: reconciliation.safe,
      conflicts: reconciliation.conflicts
    });
    await this.publish();
  }

  async handleSignal(signal: ParsedTradingViewSignal): Promise<SignalOutcome> {
    const now = this.clock();
    this.lastWebhookAt = now.toISOString();
    const existing = await this.prisma.signal.findUnique({ where: { signalId: signal.signalId } });
    if (existing) return { state: "DUPLICATE", reason: "Aynı signalId daha önce işlendi" };
    if (isStale(signal.sentAt, now, defaultStrategyConfig.signalMaxAgeSeconds)) {
      return this.reject(signal, "Sinyal eski veya gelecek zamanlı");
    }
    const symbol = await this.prisma.symbol.findUnique({ where: { code: signal.symbol } });
    if (!symbol?.enabled) return this.reject(signal, "Sembol izinli izleme listesinde değil");
    const restriction = this.restrictions.check(signal.symbol, now);
    if (!restriction.allowed) return this.reject(signal, restriction.reason);

    if (signal.side === "SELL") return this.closeFromSignal(signal);
    const session = this.calendar.canOpenPosition(now);
    if (!session.allowed) return this.reject(signal, session.reason);
    const score = evaluateLongSetup(signal.signalPrice, signal.metrics, defaultStrategyConfig);
    const configuration = await this.prisma.userConfiguration.findUniqueOrThrow({ where: { id: "singleton" } });
    if (configuration.killSwitchActive) return this.reject(signal, "Acil durdur etkin", score.score, score.tier, score);
    if (this.env.TRADING_MODE === "LIVE" && !configuration.liveEnabled) {
      return this.reject(signal, "Canlı emir iletimi açık onayı verilmedi", score.score, score.tier, score);
    }

    const positions = await this.broker.getPositions();
    if (positions.some((position) => position.symbol === signal.symbol && position.quantity > 0)) {
      return this.reject(signal, "Sembolde zaten açık pozisyon var", score.score, score.tier, score);
    }
    const openOrders = (await this.broker.getOrders()).filter((order) =>
      order.symbol === signal.symbol && ["ACCEPTED", "PARTIALLY_FILLED", "PENDING"].includes(order.status)
    );
    if (openOrders.some((order) => order.side === "BUY")) {
      return this.reject(signal, "Sembolde eşdeğer bekleyen alış emri var", score.score, score.tier, score);
    }

    const risk = await this.riskDecision();
    const account = await this.broker.getAccount();
    const planResult = createTradePlan({
      signalId: signal.signalId,
      symbol: signal.symbol,
      signalPrice: signal.signalPrice,
      metrics: signal.metrics,
      score,
      account,
      risk,
      config: defaultStrategyConfig,
      now
    });
    if (!planResult.ok) return this.reject(signal, planResult.reason, score.score, score.tier, score);

    const plan = planResult.plan;
    await this.prisma.signal.create({
      data: {
        signalId: signal.signalId,
        symbol: signal.symbol,
        side: signal.side,
        score: score.score,
        tier: score.tier,
        state: "ORDER_PENDING",
        reason: "Tüm emir kapıları geçti",
        planJson: JSON.stringify(plan),
        conditionsJson: JSON.stringify([...score.passed, ...score.failed])
      }
    });
    const request: OrderRequest = {
      clientOrderId: `entry-${signal.signalId}`,
      signalId: signal.signalId,
      symbol: signal.symbol,
      side: "BUY",
      type: "LIMIT",
      quantity: plan.quantity,
      limitPrice: plan.limitPrice,
      timeInForce: "DAY",
      expiresAt: plan.expiresAt,
      metadata: {
        purpose: "ENTRY",
        stopPrice: plan.stopPrice,
        target1: plan.target1,
        target2: plan.target2,
        riskTry: plan.riskTry
      }
    };
    const response = await this.broker.placeOrder(request);
    await this.persistOrder(response, "ENTRY");
    await this.prisma.signal.update({
      where: { signalId: signal.signalId },
      data: {
        state: response.status === "REJECTED" ? "REJECTED" : "ORDER_SENT",
        reason: response.rejectionReason ?? "Limit alış emri gönderildi; gerçekleşme bekleniyor"
      }
    });
    await this.audit("SYSTEM", "ENTRY_ORDER_SENT", "Signal", signal.signalId, {
      symbol: signal.symbol,
      quantity: plan.quantity,
      limitPrice: plan.limitPrice,
      brokerStatus: response.status
    });
    await this.safeNotify({ event: "ORDER", message: `${signal.symbol} ${plan.quantity} adet limit alış isteği: ${response.status}` });
    await this.publish();
    return {
      state: response.status === "REJECTED" ? "REJECTED" : "ACCEPTED",
      reason: response.rejectionReason ?? "Emir kabul edildi; henüz gerçekleşmiş sayılmaz",
      order: response,
      plan
    };
  }

  async processPaperCandle(candle: MarketCandle): Promise<Execution[]> {
    if (!("processCandle" in this.broker) || typeof this.broker.processCandle !== "function") {
      throw new Error("Mum işleme yalnız PaperBroker modunda kullanılabilir");
    }
    const executions = await (this.broker.processCandle as (value: MarketCandle) => Promise<Execution[]>)(candle);
    await this.publish();
    return executions;
  }

  async sessionWatchdog(): Promise<void> {
    const now = this.clock();
    const date = this.calendar.dateKey(now);
    if (!this.calendar.mustForceExit(now) || this.sessionCloseRequestedDate === date) return;
    const positions = await this.broker.getPositions();
    if (!positions.length) return;
    this.sessionCloseRequestedDate = date;
    await this.closeAllPositions("SESSION_WATCHDOG");
    await this.audit("SYSTEM", "FORCED_SESSION_EXIT", "Position", null, { date, count: positions.length });
  }

  async reconciliationWatchdog(): Promise<void> {
    try {
      const result = await this.broker.reconcile();
      this.connection = {
        connected: true,
        adapter: this.broker.name,
        reconciliation: this.connection.reconciliation,
        message: result.safe ? "Periyodik mutabakat başarılı" : `Mutabakat engeli: ${result.conflicts.join("; ")}`,
        checkedAt: this.clock().toISOString()
      };
      const daily = await this.ensureDaily(result.account.equity || 100_000);
      await this.prisma.dailyRiskState.update({ where: { id: daily.id }, data: { reconciled: result.safe } });
      await this.prisma.brokerConnection.update({
        where: { adapter: this.broker.name },
        data: {
          status: "CONNECTED",
          lastReconciledAt: result.safe ? this.clock() : null
        }
      });
      if (!result.safe && this.lastReconciliationSafe !== false) await this.safeNotify({ event: "CONNECTION", message: "Mutabakat güvenli değil; yeni emirler kapatıldı" });
      this.lastReconciliationSafe = result.safe;
    } catch (error) {
      this.connection = {
        connected: false,
        adapter: this.broker.name,
        reconciliation: "NONE",
        message: `Bağlantı/mutabakat hatası: ${errorMessage(error)}`,
        checkedAt: this.clock().toISOString()
      };
      const daily = await this.ensureDaily(100_000);
      await this.prisma.dailyRiskState.update({ where: { id: daily.id }, data: { reconciled: false } });
      if (this.lastReconciliationSafe !== false) await this.safeNotify({ event: "CONNECTION", message: "Aracı kurum bağlantısı güvenilir değil; yeni emirler kapatıldı" });
      this.lastReconciliationSafe = false;
    }
    await this.publish();
  }

  async activateKillSwitch(actor: string): Promise<void> {
    await this.prisma.userConfiguration.update({ where: { id: "singleton" }, data: { killSwitchActive: true, liveEnabled: false } });
    const openEntryOrders = await this.prisma.order.findMany({ where: { purpose: "ENTRY", status: { in: ["PENDING", "ACCEPTED", "PARTIALLY_FILLED"] } } });
    for (const order of openEntryOrders) {
      if (order.brokerOrderId) {
        try {
          await this.broker.cancelOrder(order.brokerOrderId);
          await this.prisma.order.update({ where: { id: order.id }, data: { status: "CANCELLED" } });
        } catch (error) {
          await this.audit("SYSTEM", "ENTRY_CANCEL_FAILED", "Order", order.id, { error: errorMessage(error) });
        }
      }
    }
    await this.audit(actor, "KILL_SWITCH_ON", "UserConfiguration", "singleton", { cancelledEntryOrders: openEntryOrders.length });
    await this.safeNotify({ event: "RISK", message: "Acil durdur etkin; yeni girişler kapalı" });
    await this.publish();
  }

  async clearKillSwitch(actor: string, confirmation: string): Promise<void> {
    if (confirmation !== "ACİL DURDURMAYI KALDIR") throw new Error("Onay metni yanlış");
    const reconciliation = await this.broker.reconcile();
    if (!reconciliation.safe) throw new Error(`Mutabakat güvenli değil: ${reconciliation.conflicts.join("; ")}`);
    await this.prisma.userConfiguration.update({ where: { id: "singleton" }, data: { killSwitchActive: false } });
    await this.audit(actor, "KILL_SWITCH_OFF", "UserConfiguration", "singleton", {});
    await this.publish();
  }

  async enableLive(actor: string, confirmation: string): Promise<void> {
    if (confirmation !== "CANLI İŞLEMİ AÇ") throw new Error("Canlı işlem onay metni yanlış");
    if (!this.env.LIVE_MODE_ENABLED || this.env.TRADING_MODE !== "LIVE") throw new Error("Sunucu canlı mod için başlatılmadı");
    if (this.broker.name === "PaperBroker") throw new Error("PaperBroker gerçek emir iletemez");
    const reconciliation = await this.broker.reconcile();
    if (!reconciliation.safe || this.connection.reconciliation !== "FULL") {
      throw new Error("Tam hesap/emir/pozisyon mutabakatı olmayan adaptörde canlı işlem açılamaz");
    }
    const risk = await this.riskDecision();
    if (!risk.allowNewOrders) throw new Error(risk.reasons.join("; "));
    await this.prisma.userConfiguration.update({ where: { id: "singleton" }, data: { tradingMode: "LIVE", liveEnabled: true } });
    await this.audit(actor, "LIVE_MODE_ENABLED", "UserConfiguration", "singleton", { broker: this.broker.name });
    await this.publish();
  }

  async closeAllPositions(actor: string): Promise<OrderResponse[]> {
    const positions = await this.broker.getPositions();
    const responses: OrderResponse[] = [];
    for (const position of positions) {
      const response = await this.broker.placeOrder({
        clientOrderId: `emergency-close-${position.symbol}-${randomUUID()}`,
        signalId: `manual-close-${position.symbol}-${this.clock().getTime()}`,
        symbol: position.symbol,
        side: "SELL",
        type: "MARKET",
        quantity: position.quantity,
        timeInForce: "IOC",
        reduceOnly: true,
        metadata: { purpose: "EMERGENCY_CLOSE" }
      });
      responses.push(response);
      await this.persistOrder(response, "EMERGENCY_CLOSE");
    }
    await this.audit(actor, "CLOSE_ALL_REQUESTED", "Position", null, { count: positions.length });
    await this.publish();
    return responses;
  }

  async updateCapital(capitalTry: number, actor: string): Promise<void> {
    if (!Number.isFinite(capitalTry) || capitalTry < 1_000) throw new Error("Sermaye en az ₺1.000 olmalıdır");
    const positions = await this.broker.getPositions();
    const openOrders = (await this.broker.getOrders()).filter((order) => ["PENDING", "ACCEPTED", "PARTIALLY_FILLED"].includes(order.status));
    if (positions.length || openOrders.length) throw new Error("Açık pozisyon veya emir varken sermaye değiştirilemez");
    if ("setCapital" in this.broker && typeof this.broker.setCapital === "function") {
      (this.broker.setCapital as (value: number) => void)(capitalTry);
    }
    await this.prisma.userConfiguration.update({ where: { id: "singleton" }, data: { capitalTry } });
    await this.audit(actor, "CAPITAL_UPDATED", "UserConfiguration", "singleton", { capitalTry });
    await this.publish();
  }

  async updateWatchlist(symbols: string[], actor: string): Promise<void> {
    const clean = [...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()))];
    if (!clean.length || clean.length > 200 || clean.some((symbol) => !/^[A-Z0-9]{2,20}$/.test(symbol))) throw new Error("İzleme listesi geçersiz");
    await this.prisma.symbol.updateMany({ data: { enabled: false } });
    for (const code of clean) {
      await this.prisma.symbol.upsert({ where: { code }, create: { code, enabled: true }, update: { enabled: true } });
    }
    await this.prisma.userConfiguration.update({ where: { id: "singleton" }, data: { watchlistJson: JSON.stringify(clean) } });
    await this.audit(actor, "WATCHLIST_UPDATED", "UserConfiguration", "singleton", { count: clean.length });
  }

  async dashboard(): Promise<DashboardSnapshot> {
    const account = await this.safeAccount();
    const positions = await this.broker.getPositions().catch(() => [] as Position[]);
    const orders = await this.broker.getOrders().catch(() => [] as OrderResponse[]);
    const configuration = await this.prisma.userConfiguration.findUniqueOrThrow({ where: { id: "singleton" } });
    const daily = await this.ensureDaily(account.equity || configuration.capitalTry);
    const risk = await this.riskDecision();
    const recent = await this.prisma.signal.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
    const restrictionHealth = this.restrictions.health(this.clock());
    const calendarHealth = this.calendar.health(this.clock());
    return {
      mode: (configuration.liveEnabled ? "LIVE" : "PAPER") as TradingMode,
      broker: this.connection,
      capital: configuration.capitalTry,
      availableCash: account.availableCash,
      realisedPnl: daily.realisedPnl,
      unrealisedPnl: positions.reduce((sum, position) => sum + position.unrealisedPnl, 0),
      risk,
      dataFresh: risk.reasons.every((reason) => !reason.includes("verisi eski")),
      lastWebhookAt: this.lastWebhookAt,
      killSwitchActive: configuration.killSwitchActive,
      openPositions: positions,
      pendingOrders: orders.filter((order) => ["PENDING", "ACCEPTED", "PARTIALLY_FILLED"].includes(order.status)),
      recentSignals: recent.map((signal) => ({
        id: signal.signalId,
        symbol: signal.symbol,
        state: signal.state,
        score: signal.score,
        createdAt: signal.createdAt.toISOString(),
        reason: signal.reason
      })),
      health: [
        { name: "Aracı kurum", state: this.connection.connected ? "OK" : "BLOCKED", detail: this.connection.message },
        { name: "Mutabakat", state: daily.reconciled ? "OK" : "BLOCKED", detail: daily.reconciled ? "Hesap ve yerel durum uyumlu" : "Yeni emirler kapalı" },
        { name: "Kısıt verisi", state: restrictionHealth.state, detail: restrictionHealth.detail },
        { name: "Borsa takvimi", state: calendarHealth.state, detail: calendarHealth.detail },
        { name: "Canlı koruma", state: this.env.TRADING_MODE === "LIVE" && !configuration.liveEnabled ? "WARN" : "OK", detail: configuration.liveEnabled ? "Canlı emir açık" : "Varsayılan güvenli mod" }
      ]
    };
  }

  private async closeFromSignal(signal: ParsedTradingViewSignal): Promise<SignalOutcome> {
    const position = (await this.broker.getPositions()).find((item) => item.symbol === signal.symbol);
    if (!position) return this.reject(signal, "Satış sinyalinde açık pozisyon yok");
    const response = await this.broker.placeOrder({
      clientOrderId: `exit-${signal.signalId}`,
      signalId: signal.signalId,
      symbol: signal.symbol,
      side: "SELL",
      type: "LIMIT",
      quantity: position.quantity,
      limitPrice: signal.signalPrice,
      timeInForce: "DAY",
      expiresAt: new Date(this.clock().getTime() + defaultStrategyConfig.entryExpirySeconds * 1000).toISOString(),
      reduceOnly: true,
      metadata: { purpose: "SIGNAL_EXIT" }
    });
    await this.prisma.signal.create({
      data: {
        signalId: signal.signalId,
        symbol: signal.symbol,
        side: signal.side,
        score: 0,
        tier: "C",
        state: "EXIT_SENT",
        reason: "Onaylı satış emri gönderildi",
        conditionsJson: "[]"
      }
    });
    await this.persistOrder(response, "SIGNAL_EXIT");
    await this.publish();
    return { state: "CLOSE_SENT", reason: "Kapanış emri gönderildi; gerçekleşme bekleniyor", order: response };
  }

  private async reject(
    signal: ParsedTradingViewSignal,
    reason: string,
    score = 0,
    tier: "A" | "B" | "C" = "C",
    scoreDetails?: ReturnType<typeof evaluateLongSetup>
  ): Promise<SignalOutcome> {
    await this.prisma.signal.create({
      data: {
        signalId: signal.signalId,
        symbol: signal.symbol,
        side: signal.side,
        score,
        tier,
        state: "REJECTED",
        reason,
        conditionsJson: JSON.stringify(scoreDetails ? [...scoreDetails.passed, ...scoreDetails.failed] : [])
      }
    });
    await this.audit("SYSTEM", "SIGNAL_REJECTED", "Signal", signal.signalId, { symbol: signal.symbol, reason });
    await this.publish();
    return { state: "REJECTED", reason };
  }

  private async onExecution(execution: Execution): Promise<void> {
    await this.prisma.execution.upsert({
      where: { executionId: execution.executionId },
      create: { ...execution, executedAt: new Date(execution.executedAt) },
      update: {}
    });
    const brokerOrder = await this.broker.getOrderStatus(execution.brokerOrderId);
    const storedOrder = await this.prisma.order.findFirst({ where: { brokerOrderId: execution.brokerOrderId } });
    if (storedOrder) {
      await this.prisma.order.update({
        where: { id: storedOrder.id },
        data: {
          status: brokerOrder.status,
          filledQuantity: brokerOrder.filledQuantity,
          averageFillPrice: brokerOrder.averageFillPrice
        }
      });
      if (execution.side === "BUY" && storedOrder.purpose === "ENTRY") {
        await this.ensureProtection(storedOrder.signalId, storedOrder.symbol);
      } else if (execution.side === "SELL") {
        await this.onExitExecution(storedOrder, execution);
      }
    }
    await this.syncBrokerState();
    await this.audit("BROKER", "EXECUTION", "Execution", execution.executionId, {
      symbol: execution.symbol,
      side: execution.side,
      quantity: execution.quantity,
      price: execution.price
    });
    await this.safeNotify({ event: "EXECUTION", message: `${execution.symbol} ${execution.side} ${execution.quantity} adet gerçekleşti` });
    await this.publish();
  }

  private async ensureProtection(signalId: string, symbol: string): Promise<void> {
    const signal = await this.prisma.signal.findUnique({ where: { signalId } });
    if (!signal?.planJson) return;
    const plan = JSON.parse(signal.planJson) as TradePlan;
    const position = (await this.broker.getPositions()).find((item) => item.symbol === symbol);
    if (!position || position.quantity < 1) return;
    const firstQuantity = Math.max(1, Math.floor(position.quantity * defaultStrategyConfig.firstTargetFraction));
    const secondQuantity = Math.max(0, position.quantity - firstQuantity);
    const desired = [
      { purpose: "STOP", side: "SELL" as const, type: "STOP" as const, quantity: position.quantity, stopPrice: plan.stopPrice },
      { purpose: "TARGET1", side: "SELL" as const, type: "LIMIT" as const, quantity: firstQuantity, limitPrice: plan.target1 },
      ...(secondQuantity > 0 ? [{ purpose: "TARGET2", side: "SELL" as const, type: "LIMIT" as const, quantity: secondQuantity, limitPrice: plan.target2 }] : [])
    ];
    const brokerOrders = await this.broker.getOrders();
    for (const target of desired) {
      const existing = brokerOrders.find((order) =>
        order.signalId === signalId && order.metadata?.purpose === target.purpose && ["ACCEPTED", "PARTIALLY_FILLED"].includes(order.status)
      );
      if (existing) {
        const replaced = await this.broker.replaceOrder(existing.brokerOrderId, {
          quantity: target.quantity,
          ...(target.limitPrice !== undefined ? { limitPrice: target.limitPrice } : {}),
          ...(target.stopPrice !== undefined ? { stopPrice: target.stopPrice } : {})
        });
        await this.persistOrder(replaced, target.purpose);
        continue;
      }
      const request: OrderRequest = {
        clientOrderId: `${target.purpose.toLowerCase()}-${signalId}-${position.quantity}`,
        signalId,
        symbol,
        side: target.side,
        type: target.type,
        quantity: target.quantity,
        ...(target.limitPrice !== undefined ? { limitPrice: target.limitPrice } : {}),
        ...(target.stopPrice !== undefined ? { stopPrice: target.stopPrice } : {}),
        timeInForce: "DAY",
        reduceOnly: true,
        metadata: { purpose: target.purpose }
      };
      const response = await this.broker.placeOrder(request);
      await this.persistOrder(response, target.purpose);
    }
    await this.prisma.signal.update({ where: { signalId }, data: { state: "PROTECTED", reason: "Gerçekleşen adet için stop ve hedefler etkin" } });
  }

  private async onExitExecution(storedOrder: { signalId: string; symbol: string; purpose: string }, execution: Execution): Promise<void> {
    const position = (await this.broker.getPositions()).find((item) => item.symbol === storedOrder.symbol);
    const orders = await this.broker.getOrders();
    if (storedOrder.purpose === "TARGET1" && position) {
      const trade = await this.prisma.trade.findUnique({ where: { signalId: storedOrder.signalId } });
      const stop = orders.find((order) => order.signalId === storedOrder.signalId && order.metadata?.purpose === "STOP" && ["ACCEPTED", "PARTIALLY_FILLED"].includes(order.status));
      if (stop && trade) {
        const breakEven = trade.entryPrice * (1 + defaultStrategyConfig.breakEvenCostBufferBps / 10_000);
        const replaced = await this.broker.replaceOrder(stop.brokerOrderId, { quantity: position.quantity, stopPrice: Number(breakEven.toFixed(2)) });
        await this.persistOrder(replaced, "STOP");
      }
    }
    if (!position) {
      for (const order of orders.filter((item) => item.signalId === storedOrder.signalId && ["ACCEPTED", "PARTIALLY_FILLED"].includes(item.status))) {
        await this.broker.cancelOrder(order.brokerOrderId);
      }
      await this.finalizeTrade(storedOrder.signalId, execution.price, storedOrder.purpose);
    }
  }

  private async finalizeTrade(signalId: string, exitPrice: number, reason: string): Promise<void> {
    const trade = await this.prisma.trade.findUnique({ where: { signalId } });
    if (!trade || trade.closedAt) return;
    const executions = await this.prisma.execution.findMany({
      where: { brokerOrderId: { in: (await this.prisma.order.findMany({ where: { signalId } })).map((order) => order.brokerOrderId).filter((id): id is string => Boolean(id)) } }
    });
    const buys = executions.filter((execution) => execution.side === "BUY").reduce((sum, execution) => sum + execution.price * execution.quantity, 0);
    const sells = executions.filter((execution) => execution.side === "SELL").reduce((sum, execution) => sum + execution.price * execution.quantity, 0);
    const commissions = executions.reduce((sum, execution) => sum + execution.commission, 0);
    const netPnl = sells - buys - commissions;
    const signal = await this.prisma.signal.findUnique({ where: { signalId } });
    const plan = signal?.planJson ? JSON.parse(signal.planJson) as TradePlan : null;
    const resultR = plan && plan.riskTry > 0 ? netPnl / plan.riskTry : null;
    await this.prisma.trade.update({
      where: { signalId },
      data: { exitPrice, grossPnl: sells - buys, netPnl, resultR, closedAt: this.clock(), closeReason: reason }
    });
    const daily = await this.ensureDaily((await this.safeAccount()).equity);
    await this.prisma.dailyRiskState.update({
      where: { id: daily.id },
      data: {
        realisedPnl: { increment: netPnl },
        completedTrades: { increment: 1 },
        consecutiveLosses: netPnl < 0 ? { increment: 1 } : 0
      }
    });
  }

  private async syncBrokerState(): Promise<void> {
    const positions = await this.broker.getPositions().catch(() => [] as Position[]);
    for (const position of positions) {
      await this.prisma.position.upsert({
        where: { symbol: position.symbol },
        create: { ...position, openedAt: new Date(position.openedAt), protectionState: position.stopPrice ? "PROTECTED" : "UNVERIFIED" },
        update: {
          quantity: position.quantity,
          averagePrice: position.averagePrice,
          lastPrice: position.lastPrice,
          stopPrice: position.stopPrice,
          target1: position.target1,
          target2: position.target2,
          target1Completed: position.target1Completed,
          protectionState: position.stopPrice ? "PROTECTED" : "UNVERIFIED"
        }
      });
    }
    const symbols = positions.map((position) => position.symbol);
    await this.prisma.position.deleteMany({ where: symbols.length ? { symbol: { notIn: symbols } } : {} });

    const entryExecutions = await this.prisma.execution.findMany({ where: { side: "BUY" } });
    for (const execution of entryExecutions) {
      const order = await this.prisma.order.findFirst({ where: { brokerOrderId: execution.brokerOrderId, purpose: "ENTRY" } });
      if (!order) continue;
      await this.prisma.trade.upsert({
        where: { signalId: order.signalId },
        create: {
          signalId: order.signalId,
          symbol: order.symbol,
          entryPrice: execution.price,
          quantity: execution.quantity,
          openedAt: execution.executedAt,
          strategy: defaultStrategyConfig.version
        },
        update: {
          entryPrice: order.averageFillPrice ?? execution.price,
          quantity: order.filledQuantity
        }
      });
    }
  }

  private async persistOrder(order: OrderResponse, purpose: string): Promise<void> {
    await this.prisma.order.upsert({
      where: { clientOrderId: order.clientOrderId },
      create: {
        clientOrderId: order.clientOrderId,
        brokerOrderId: order.brokerOrderId,
        signalId: order.signalId,
        symbol: order.symbol,
        side: order.side,
        type: order.type,
        quantity: order.quantity,
        filledQuantity: order.filledQuantity,
        limitPrice: order.limitPrice ?? null,
        stopPrice: order.stopPrice ?? null,
        averageFillPrice: order.averageFillPrice ?? null,
        status: order.status,
        purpose,
        rawResponseJson: JSON.stringify({ status: order.status, rejectionReason: order.rejectionReason })
      },
      update: {
        brokerOrderId: order.brokerOrderId,
        filledQuantity: order.filledQuantity,
        averageFillPrice: order.averageFillPrice,
        status: order.status
      }
    });
  }

  private async riskDecision(): Promise<RiskDecision> {
    const configuration = await this.prisma.userConfiguration.findUniqueOrThrow({ where: { id: "singleton" } });
    const account = await this.safeAccount();
    const daily = await this.ensureDaily(account.equity || configuration.capitalTry);
    const snapshot: DailyRiskSnapshot = {
      date: daily.date,
      openingCapital: daily.openingCapital,
      realisedPnl: daily.realisedPnl,
      unrealisedPnl: daily.unrealisedPnl,
      consecutiveLosses: daily.consecutiveLosses,
      completedTrades: daily.completedTrades,
      killSwitchActive: configuration.killSwitchActive,
      brokerReliable: this.connection.connected,
      dataFresh: this.lastWebhookAt !== null && this.clock().getTime() - new Date(this.lastWebhookAt).getTime() <= 20 * 60_000,
      reconciled: daily.reconciled,
      contradictoryState: false
    };
    return deriveRiskDecision(snapshot, defaultStrategyConfig);
  }

  private async ensureDaily(openingCapital: number) {
    const date = dateKey(this.clock());
    return this.prisma.dailyRiskState.upsert({
      where: { date },
      create: { date, openingCapital, reconciled: false },
      update: {}
    });
  }

  private async safeAccount() {
    try {
      return await this.broker.getAccount();
    } catch {
      const configuration = await this.prisma.userConfiguration.findUnique({ where: { id: "singleton" } });
      const capital = configuration?.capitalTry ?? 100_000;
      return { currency: "TRY" as const, cash: capital, availableCash: capital, equity: capital, updatedAt: this.clock().toISOString() };
    }
  }

  private async audit(actor: string, action: string, entityType: string, entityId: string | null, details: unknown): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actor,
        action,
        entityType,
        entityId,
        detailsJson: JSON.stringify(redact(details))
      }
    });
  }

  private async publish(): Promise<void> {
    if (!this.broadcast) return;
    this.broadcast(await this.dashboard());
  }

  private async safeNotify(notification: SafeNotification): Promise<void> {
    if (!this.notify) return;
    try {
      await this.notify(notification);
    } catch (error) {
      await this.audit("SYSTEM", "NOTIFICATION_FAILED", "Notification", null, { error: errorMessage(error), event: notification.event });
    }
  }
}

function dateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Bilinmeyen hata";
}

function redact(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  return JSON.parse(JSON.stringify(value, (key, nested) => /token|secret|password|api.?key/i.test(key) ? "[MASKED]" : nested));
}
