-- Paket 2.3: reply by e-mail (inbound).
CREATE TYPE "MessageSource" AS ENUM ('APP', 'EMAIL');
CREATE TYPE "InboundEmailStatus" AS ENUM ('PROCESSING', 'PROCESSED', 'REJECTED', 'IGNORED', 'FAILED');

ALTER TABLE "TicketMessage" ADD COLUMN "source" "MessageSource" NOT NULL DEFAULT 'APP';

CREATE TABLE "InboundEmail" (
    "id" TEXT NOT NULL,
    "mailboxKey" VARCHAR(200) NOT NULL,
    "providerMessageId" VARCHAR(500) NOT NULL,
    "messageIdHeader" VARCHAR(500),
    "fromAddress" VARCHAR(320),
    "subject" VARCHAR(200) NOT NULL,
    "receivedAt" TIMESTAMP(3),
    "status" "InboundEmailStatus" NOT NULL DEFAULT 'PROCESSING',
    "reason" VARCHAR(64),
    "ticketId" TEXT,
    "ticketMessageId" TEXT,
    "createdTicketId" TEXT,
    "rawStorageKey" VARCHAR(300),
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InboundEmail_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InboundEmail_mailboxKey_providerMessageId_key" ON "InboundEmail"("mailboxKey", "providerMessageId");
CREATE INDEX "InboundEmail_status_createdAt_idx" ON "InboundEmail"("status", "createdAt");
CREATE INDEX "InboundEmail_createdAt_idx" ON "InboundEmail"("createdAt");
CREATE INDEX "InboundEmail_fromAddress_createdAt_idx" ON "InboundEmail"("fromAddress", "createdAt");

CREATE TABLE "InboundMailboxState" (
    "mailboxKey" VARCHAR(200) NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastError" VARCHAR(500),
    "lastErrorAt" TIMESTAMP(3),
    "consecutiveFails" INTEGER NOT NULL DEFAULT 0,
    "alertedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InboundMailboxState_pkey" PRIMARY KEY ("mailboxKey")
);
