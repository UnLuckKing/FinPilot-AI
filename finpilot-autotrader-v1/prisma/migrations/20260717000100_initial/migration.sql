CREATE TABLE "UserConfiguration" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
  "tradingMode" TEXT NOT NULL DEFAULT 'PAPER',
  "capitalTry" REAL NOT NULL DEFAULT 100000,
  "selectedBroker" TEXT NOT NULL DEFAULT 'PAPER',
  "watchlistJson" TEXT NOT NULL DEFAULT '[]',
  "killSwitchActive" BOOLEAN NOT NULL DEFAULT false,
  "liveEnabled" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" DATETIME NOT NULL
);
CREATE TABLE "StrategyVersion" ("id" TEXT NOT NULL PRIMARY KEY, "version" TEXT NOT NULL, "configJson" TEXT NOT NULL, "active" BOOLEAN NOT NULL DEFAULT false, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX "StrategyVersion_version_key" ON "StrategyVersion"("version");
CREATE TABLE "Symbol" ("id" TEXT NOT NULL PRIMARY KEY, "code" TEXT NOT NULL, "exchange" TEXT NOT NULL DEFAULT 'BIST', "enabled" BOOLEAN NOT NULL DEFAULT true, "restricted" BOOLEAN NOT NULL DEFAULT false, "restrictionReason" TEXT, "restrictionExpiry" DATETIME, "updatedAt" DATETIME NOT NULL);
CREATE UNIQUE INDEX "Symbol_code_key" ON "Symbol"("code");
CREATE TABLE "Signal" ("id" TEXT NOT NULL PRIMARY KEY, "signalId" TEXT NOT NULL, "symbol" TEXT NOT NULL, "side" TEXT NOT NULL, "score" INTEGER NOT NULL, "tier" TEXT NOT NULL, "state" TEXT NOT NULL, "reason" TEXT NOT NULL, "planJson" TEXT, "conditionsJson" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL);
CREATE UNIQUE INDEX "Signal_signalId_key" ON "Signal"("signalId"); CREATE INDEX "Signal_symbol_createdAt_idx" ON "Signal"("symbol", "createdAt");
CREATE TABLE "Order" ("id" TEXT NOT NULL PRIMARY KEY, "clientOrderId" TEXT NOT NULL, "brokerOrderId" TEXT, "signalId" TEXT NOT NULL, "symbol" TEXT NOT NULL, "side" TEXT NOT NULL, "type" TEXT NOT NULL, "quantity" INTEGER NOT NULL, "filledQuantity" INTEGER NOT NULL DEFAULT 0, "limitPrice" REAL, "stopPrice" REAL, "averageFillPrice" REAL, "status" TEXT NOT NULL, "purpose" TEXT NOT NULL DEFAULT 'ENTRY', "rawResponseJson" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL);
CREATE UNIQUE INDEX "Order_clientOrderId_key" ON "Order"("clientOrderId"); CREATE UNIQUE INDEX "Order_brokerOrderId_key" ON "Order"("brokerOrderId"); CREATE INDEX "Order_signalId_idx" ON "Order"("signalId"); CREATE INDEX "Order_symbol_status_idx" ON "Order"("symbol", "status");
CREATE TABLE "Execution" ("id" TEXT NOT NULL PRIMARY KEY, "executionId" TEXT NOT NULL, "brokerOrderId" TEXT NOT NULL, "symbol" TEXT NOT NULL, "side" TEXT NOT NULL, "quantity" INTEGER NOT NULL, "price" REAL NOT NULL, "commission" REAL NOT NULL, "executedAt" DATETIME NOT NULL);
CREATE UNIQUE INDEX "Execution_executionId_key" ON "Execution"("executionId"); CREATE INDEX "Execution_brokerOrderId_idx" ON "Execution"("brokerOrderId");
CREATE TABLE "Position" ("id" TEXT NOT NULL PRIMARY KEY, "symbol" TEXT NOT NULL, "quantity" INTEGER NOT NULL, "averagePrice" REAL NOT NULL, "lastPrice" REAL NOT NULL, "stopPrice" REAL, "target1" REAL, "target2" REAL, "target1Completed" BOOLEAN NOT NULL DEFAULT false, "protectionState" TEXT NOT NULL DEFAULT 'UNVERIFIED', "openedAt" DATETIME NOT NULL, "updatedAt" DATETIME NOT NULL);
CREATE UNIQUE INDEX "Position_symbol_key" ON "Position"("symbol");
CREATE TABLE "ProtectionOrder" ("id" TEXT NOT NULL PRIMARY KEY, "positionId" TEXT NOT NULL, "brokerOrderId" TEXT, "kind" TEXT NOT NULL, "price" REAL NOT NULL, "quantity" INTEGER NOT NULL, "status" TEXT NOT NULL, "native" BOOLEAN NOT NULL DEFAULT false, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL);
CREATE INDEX "ProtectionOrder_positionId_status_idx" ON "ProtectionOrder"("positionId", "status");
CREATE TABLE "Trade" ("id" TEXT NOT NULL PRIMARY KEY, "signalId" TEXT NOT NULL, "symbol" TEXT NOT NULL, "entryPrice" REAL NOT NULL, "exitPrice" REAL, "quantity" INTEGER NOT NULL, "grossPnl" REAL NOT NULL DEFAULT 0, "netPnl" REAL NOT NULL DEFAULT 0, "resultR" REAL, "openedAt" DATETIME NOT NULL, "closedAt" DATETIME, "closeReason" TEXT, "strategy" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX "Trade_signalId_key" ON "Trade"("signalId"); CREATE INDEX "Trade_symbol_openedAt_idx" ON "Trade"("symbol", "openedAt");
CREATE TABLE "DailyRiskState" ("id" TEXT NOT NULL PRIMARY KEY, "date" TEXT NOT NULL, "openingCapital" REAL NOT NULL, "realisedPnl" REAL NOT NULL DEFAULT 0, "unrealisedPnl" REAL NOT NULL DEFAULT 0, "consecutiveLosses" INTEGER NOT NULL DEFAULT 0, "completedTrades" INTEGER NOT NULL DEFAULT 0, "state" TEXT NOT NULL DEFAULT 'NORMAL', "lockedReason" TEXT, "reconciled" BOOLEAN NOT NULL DEFAULT false, "updatedAt" DATETIME NOT NULL);
CREATE UNIQUE INDEX "DailyRiskState_date_key" ON "DailyRiskState"("date");
CREATE TABLE "BrokerConnection" ("id" TEXT NOT NULL PRIMARY KEY, "adapter" TEXT NOT NULL, "status" TEXT NOT NULL, "reconciliationLevel" TEXT NOT NULL, "encryptedConfiguration" TEXT, "lastConnectedAt" DATETIME, "lastReconciledAt" DATETIME, "updatedAt" DATETIME NOT NULL);
CREATE UNIQUE INDEX "BrokerConnection_adapter_key" ON "BrokerConnection"("adapter");
CREATE TABLE "WebhookEvent" ("id" TEXT NOT NULL PRIMARY KEY, "idempotencyKey" TEXT NOT NULL, "nonce" TEXT NOT NULL, "signalId" TEXT NOT NULL, "payloadJson" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING', "attemptCount" INTEGER NOT NULL DEFAULT 0, "error" TEXT, "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "processedAt" DATETIME);
CREATE UNIQUE INDEX "WebhookEvent_idempotencyKey_key" ON "WebhookEvent"("idempotencyKey"); CREATE UNIQUE INDEX "WebhookEvent_nonce_key" ON "WebhookEvent"("nonce"); CREATE INDEX "WebhookEvent_status_receivedAt_idx" ON "WebhookEvent"("status", "receivedAt");
CREATE TABLE "AuditLog" ("id" TEXT NOT NULL PRIMARY KEY, "actor" TEXT NOT NULL, "action" TEXT NOT NULL, "entityType" TEXT NOT NULL, "entityId" TEXT, "detailsJson" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE TABLE "SystemHealth" ("id" TEXT NOT NULL PRIMARY KEY, "key" TEXT NOT NULL, "state" TEXT NOT NULL, "detail" TEXT NOT NULL, "checkedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL);
CREATE UNIQUE INDEX "SystemHealth_key_key" ON "SystemHealth"("key");
