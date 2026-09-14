-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN "organizationalUnitId" TEXT;

-- CreateIndex
CREATE INDEX "AuditLog_organizationalUnitId_idx" ON "AuditLog"("organizationalUnitId");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationalUnitId_fkey" FOREIGN KEY ("organizationalUnitId") REFERENCES "OrganizationalUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
