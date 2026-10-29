CREATE TABLE "SlaScanFailure" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "phase" VARCHAR(16) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "lastError" VARCHAR(1000) NOT NULL,
    "nextAttemptAt" TIMESTAMP(3),
    "quarantinedAt" TIMESTAMP(3),
    "firstFailedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastFailedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SlaScanFailure_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SlaScanFailure_ticketId_key" ON "SlaScanFailure"("ticketId");
CREATE INDEX "SlaScanFailure_quarantinedAt_nextAttemptAt_idx" ON "SlaScanFailure"("quarantinedAt", "nextAttemptAt");
ALTER TABLE "SlaScanFailure" ADD CONSTRAINT "SlaScanFailure_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
