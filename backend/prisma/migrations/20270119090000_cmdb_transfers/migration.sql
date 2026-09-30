-- Paket 3.2 C9: prenosnice (transfer records), signatories by OU, monthly numbering, DOCX templates.

CREATE TYPE "AssetTransferScenario" AS ENUM ('WAREHOUSE_TO_USER', 'USER_TO_USER', 'USER_TO_WAREHOUSE');
CREATE TYPE "AssetTransferStatus" AS ENUM ('ISSUED', 'SIGNED', 'CANCELLED');

CREATE TABLE "AssetSignatory" (
    "id" TEXT NOT NULL,
    "organizationalUnitId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" VARCHAR(160),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AssetSignatory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AssetSignatory_organizationalUnitId_key" ON "AssetSignatory"("organizationalUnitId");
CREATE INDEX "AssetSignatory_userId_idx" ON "AssetSignatory"("userId");
ALTER TABLE "AssetSignatory" ADD CONSTRAINT "AssetSignatory_organizationalUnitId_fkey"
    FOREIGN KEY ("organizationalUnitId") REFERENCES "OrganizationalUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssetSignatory" ADD CONSTRAINT "AssetSignatory_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AssetTransferSequence" (
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "AssetTransferSequence_pkey" PRIMARY KEY ("year", "month")
);

CREATE TABLE "AssetTransferTemplate" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "fileName" VARCHAR(200) NOT NULL,
    "content" BYTEA NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" VARCHAR(500),
    "uploadedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssetTransferTemplate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AssetTransferTemplate_version_key" ON "AssetTransferTemplate"("version");

CREATE TABLE "AssetTransfer" (
    "id" TEXT NOT NULL,
    "number" VARCHAR(40) NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "scenario" "AssetTransferScenario" NOT NULL,
    "status" "AssetTransferStatus" NOT NULL DEFAULT 'ISSUED',
    "fromUserId" TEXT,
    "fromLabel" VARCHAR(200),
    "toUserId" TEXT,
    "toLabel" VARCHAR(200),
    "signatoryUserId" TEXT,
    "issuedByUserId" TEXT,
    "note" VARCHAR(1000),
    "templateId" TEXT,
    "snapshot" JSONB NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),
    "cancelledByUserId" TEXT,
    "cancelReason" VARCHAR(500),
    "signedAt" TIMESTAMP(3),
    "signedByUserId" TEXT,
    "signedStoragePath" TEXT,
    "signedFileName" VARCHAR(200),
    "signedMimeType" VARCHAR(80),
    "signedSizeBytes" INTEGER,
    CONSTRAINT "AssetTransfer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AssetTransfer_number_key" ON "AssetTransfer"("number");
CREATE UNIQUE INDEX "AssetTransfer_signedStoragePath_key" ON "AssetTransfer"("signedStoragePath");
CREATE UNIQUE INDEX "AssetTransfer_year_month_sequence_key" ON "AssetTransfer"("year", "month", "sequence");
CREATE INDEX "AssetTransfer_fromUserId_idx" ON "AssetTransfer"("fromUserId");
CREATE INDEX "AssetTransfer_toUserId_idx" ON "AssetTransfer"("toUserId");
CREATE INDEX "AssetTransfer_issuedAt_idx" ON "AssetTransfer"("issuedAt" DESC);
CREATE INDEX "AssetTransfer_status_idx" ON "AssetTransfer"("status");
ALTER TABLE "AssetTransfer" ADD CONSTRAINT "AssetTransfer_fromUserId_fkey"
    FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AssetTransfer" ADD CONSTRAINT "AssetTransfer_toUserId_fkey"
    FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AssetTransfer" ADD CONSTRAINT "AssetTransfer_signatoryUserId_fkey"
    FOREIGN KEY ("signatoryUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AssetTransfer" ADD CONSTRAINT "AssetTransfer_issuedByUserId_fkey"
    FOREIGN KEY ("issuedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AssetTransfer" ADD CONSTRAINT "AssetTransfer_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "AssetTransferTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "AssetTransferItem" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "assetId" TEXT,
    "position" INTEGER NOT NULL,
    CONSTRAINT "AssetTransferItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AssetTransferItem_transferId_position_key" ON "AssetTransferItem"("transferId", "position");
CREATE INDEX "AssetTransferItem_assetId_idx" ON "AssetTransferItem"("assetId");
ALTER TABLE "AssetTransferItem" ADD CONSTRAINT "AssetTransferItem_transferId_fkey"
    FOREIGN KEY ("transferId") REFERENCES "AssetTransfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssetTransferItem" ADD CONSTRAINT "AssetTransferItem_assetId_fkey"
    FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- §7a.6: the C1 handover.* keys were never used; the DOCX template carries header/footer now.
DELETE FROM "AppSetting" WHERE "key" IN ('private.assets.handover.enabled', 'private.assets.handover.header', 'private.assets.handover.footer');
