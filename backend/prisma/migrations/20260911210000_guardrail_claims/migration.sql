-- CreateTable
CREATE TABLE "GuardrailClaim" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "subjectKey" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "ticketId" TEXT,
    "actorUserId" TEXT,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuardrailClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GuardrailClaim_kind_subjectKey_fingerprint_key" ON "GuardrailClaim"("kind", "subjectKey", "fingerprint");

-- CreateIndex
CREATE INDEX "GuardrailClaim_kind_subjectKey_claimedAt_idx" ON "GuardrailClaim"("kind", "subjectKey", "claimedAt");

-- CreateIndex
CREATE INDEX "GuardrailClaim_ticketId_idx" ON "GuardrailClaim"("ticketId");

-- CreateIndex
CREATE INDEX "GuardrailClaim_expiresAt_idx" ON "GuardrailClaim"("expiresAt");

-- AddForeignKey
ALTER TABLE "GuardrailClaim" ADD CONSTRAINT "GuardrailClaim_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuardrailClaim" ADD CONSTRAINT "GuardrailClaim_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
