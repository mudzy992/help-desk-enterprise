ALTER TABLE "AuditLog" ADD COLUMN "chainPartition" TEXT NOT NULL DEFAULT 'global';
CREATE INDEX "AuditLog_chainPartition_createdAt_id_idx" ON "AuditLog"("chainPartition", "createdAt", "id");
ALTER TABLE "AuditChainCheckpoint" ADD COLUMN "partitionHeads" JSONB NOT NULL DEFAULT '{}'::jsonb;
