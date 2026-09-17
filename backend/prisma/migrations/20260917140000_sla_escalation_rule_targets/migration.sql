-- AlterTable
ALTER TABLE "SlaEscalationRule" ADD COLUMN "targetRole" TEXT;
ALTER TABLE "SlaEscalationRule" ADD COLUMN "targetUserId" TEXT;

-- CreateIndex
CREATE INDEX "SlaEscalationRule_targetUserId_idx" ON "SlaEscalationRule"("targetUserId");

-- AddForeignKey
ALTER TABLE "SlaEscalationRule" ADD CONSTRAINT "SlaEscalationRule_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
