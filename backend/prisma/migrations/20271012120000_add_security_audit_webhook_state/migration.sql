-- Paket 5.4.2 (stavka 3): delivery state of the security-audit webhook (singleton row).
CREATE TABLE "SecurityAuditWebhookState" (
    "id" TEXT NOT NULL,
    "cursorCreatedAt" TIMESTAMP(3),
    "cursorId" TEXT,
    "pendingSince" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "sentTotal" INTEGER NOT NULL DEFAULT 0,
    "failedTotal" INTEGER NOT NULL DEFAULT 0,
    "droppedTotal" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecurityAuditWebhookState_pkey" PRIMARY KEY ("id")
);
