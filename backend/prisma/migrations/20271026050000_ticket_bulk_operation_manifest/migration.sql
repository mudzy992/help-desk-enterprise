CREATE TABLE "TicketBulkOperation" (
  "id" UUID NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "actionType" TEXT NOT NULL,
  "requestHash" CHAR(64) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PROCESSING',
  "total" INTEGER NOT NULL,
  "succeeded" INTEGER NOT NULL DEFAULT 0,
  "failed" INTEGER NOT NULL DEFAULT 0,
  "rolledBack" INTEGER NOT NULL DEFAULT 0,
  "skipped" INTEGER NOT NULL DEFAULT 0,
  "responseBody" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TicketBulkOperation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TicketBulkOperation_mode_check" CHECK ("mode" IN ('atomic', 'best-effort')),
  CONSTRAINT "TicketBulkOperation_status_check" CHECK ("status" IN ('PROCESSING', 'SUCCEEDED', 'PARTIAL', 'FAILED')),
  CONSTRAINT "TicketBulkOperation_total_check" CHECK ("total" BETWEEN 1 AND 100)
);

CREATE TABLE "TicketBulkOperationItem" (
  "id" TEXT NOT NULL,
  "operationId" UUID NOT NULL,
  "itemKey" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "result" JSONB,
  "errorCode" TEXT,
  "retryable" BOOLEAN,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "completedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TicketBulkOperationItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TicketBulkOperationItem_status_check" CHECK ("status" IN ('PENDING', 'SUCCEEDED', 'FAILED', 'ROLLED_BACK', 'SKIPPED')),
  CONSTRAINT "TicketBulkOperationItem_attempts_check" CHECK ("attempts" >= 0),
  CONSTRAINT "TicketBulkOperationItem_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "TicketBulkOperation"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "TicketBulkOperation_actorUserId_createdAt_idx" ON "TicketBulkOperation"("actorUserId", "createdAt");
CREATE INDEX "TicketBulkOperation_status_updatedAt_idx" ON "TicketBulkOperation"("status", "updatedAt");
CREATE UNIQUE INDEX "TicketBulkOperationItem_operationId_itemKey_key" ON "TicketBulkOperationItem"("operationId", "itemKey");
CREATE UNIQUE INDEX "TicketBulkOperationItem_operationId_ordinal_key" ON "TicketBulkOperationItem"("operationId", "ordinal");
CREATE INDEX "TicketBulkOperationItem_operationId_status_idx" ON "TicketBulkOperationItem"("operationId", "status");
CREATE INDEX "TicketBulkOperationItem_ticketId_idx" ON "TicketBulkOperationItem"("ticketId");
