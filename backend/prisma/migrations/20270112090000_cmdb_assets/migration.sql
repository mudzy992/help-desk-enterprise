-- Paket 3.2: CMDB (assets, types/attributes, locations, relations, ticket
-- links, contracts, licences, history, import jobs), the permissions and the
-- ASSET_MANAGER role. Additive only; the module stays off until
-- private.addons.cmdb is switched on.

CREATE TYPE "AssetCategory" AS ENUM ('HARDWARE', 'SOFTWARE', 'NETWORK', 'INFRASTRUCTURE', 'OTHER');
CREATE TYPE "AssetAttributeDataType" AS ENUM ('TEXT', 'NUMBER', 'DATE', 'BOOLEAN', 'SELECT');
CREATE TYPE "AssetStatus" AS ENUM ('ORDERED', 'IN_STOCK', 'IN_USE', 'IN_REPAIR', 'LOST', 'RETIRED', 'DISPOSED');
CREATE TYPE "AssetSource" AS ENUM ('MANUAL', 'IMPORT', 'DIRECTORY');
CREATE TYPE "AssetRelationKind" AS ENUM ('DEPENDS_ON', 'INSTALLED_ON', 'CONNECTED_TO', 'RUNS_ON', 'PART_OF');
CREATE TYPE "AssetContractKind" AS ENUM ('WARRANTY', 'SUPPORT', 'LEASE', 'MAINTENANCE');
CREATE TYPE "SoftwareLicenseKind" AS ENUM ('PER_DEVICE', 'PER_USER', 'SITE', 'SUBSCRIPTION');
CREATE TYPE "AssetImportStatus" AS ENUM ('PREVIEW', 'APPLIED', 'FAILED', 'EXPIRED');
CREATE TYPE "AssetImportMode" AS ENUM ('CREATE_ONLY', 'UPSERT');

CREATE TABLE "AssetType" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(48) NOT NULL,
    "nameBs" VARCHAR(80) NOT NULL,
    "nameEn" VARCHAR(80) NOT NULL,
    "icon" VARCHAR(32) NOT NULL DEFAULT 'box',
    "category" "AssetCategory" NOT NULL DEFAULT 'HARDWARE',
    "isUserSelectable" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AssetType_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AssetType_key_key" ON "AssetType"("key");
CREATE INDEX "AssetType_archivedAt_sortOrder_idx" ON "AssetType"("archivedAt", "sortOrder");

CREATE TABLE "AssetAttribute" (
    "id" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "key" VARCHAR(48) NOT NULL,
    "labelBs" VARCHAR(80) NOT NULL,
    "labelEn" VARCHAR(80) NOT NULL,
    "dataType" "AssetAttributeDataType" NOT NULL DEFAULT 'TEXT',
    "options" JSONB,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "isUnique" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AssetAttribute_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AssetAttribute_typeId_key_key" ON "AssetAttribute"("typeId", "key");
CREATE INDEX "AssetAttribute_typeId_sortOrder_idx" ON "AssetAttribute"("typeId", "sortOrder");
ALTER TABLE "AssetAttribute" ADD CONSTRAINT "AssetAttribute_typeId_fkey"
    FOREIGN KEY ("typeId") REFERENCES "AssetType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AssetLocation" (
    "id" TEXT NOT NULL,
    "parentId" TEXT,
    "name" VARCHAR(120) NOT NULL,
    "code" VARCHAR(32),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AssetLocation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AssetLocation_code_key" ON "AssetLocation"("code");
CREATE INDEX "AssetLocation_parentId_idx" ON "AssetLocation"("parentId");
ALTER TABLE "AssetLocation" ADD CONSTRAINT "AssetLocation_parentId_fkey"
    FOREIGN KEY ("parentId") REFERENCES "AssetLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "assetTag" VARCHAR(64) NOT NULL,
    "typeId" TEXT NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "status" "AssetStatus" NOT NULL DEFAULT 'IN_STOCK',
    "serialNumber" VARCHAR(120),
    "manufacturer" VARCHAR(120),
    "model" VARCHAR(120),
    "assignedUserId" TEXT,
    "assignedAt" TIMESTAMP(3),
    "organizationalUnitId" TEXT NOT NULL,
    "locationId" TEXT,
    "serviceId" TEXT,
    "purchaseDate" TIMESTAMP(3),
    "purchaseCost" DECIMAL(12,2),
    "currency" VARCHAR(3),
    "supplier" VARCHAR(160),
    "warrantyEndsAt" TIMESTAMP(3),
    "warrantyRemindersSent" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "notes" VARCHAR(4000),
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "source" "AssetSource" NOT NULL DEFAULT 'MANUAL',
    "externalId" VARCHAR(64),
    "lastSeenAt" TIMESTAMP(3),
    "missingFromDirectoryAt" TIMESTAMP(3),
    "assignmentSuggested" BOOLEAN NOT NULL DEFAULT false,
    "retiredAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Asset_assetTag_key" ON "Asset"("assetTag");
CREATE UNIQUE INDEX "Asset_externalId_key" ON "Asset"("externalId");
CREATE INDEX "Asset_organizationalUnitId_status_idx" ON "Asset"("organizationalUnitId", "status");
CREATE INDEX "Asset_assignedUserId_idx" ON "Asset"("assignedUserId");
CREATE INDEX "Asset_typeId_status_idx" ON "Asset"("typeId", "status");
CREATE INDEX "Asset_warrantyEndsAt_idx" ON "Asset"("warrantyEndsAt");
CREATE INDEX "Asset_locationId_idx" ON "Asset"("locationId");
CREATE INDEX "Asset_serviceId_idx" ON "Asset"("serviceId");
CREATE INDEX "Asset_serialNumber_idx" ON "Asset"("serialNumber");
-- Search (same approach as tickets, 20260923140000_search_trigram_indexes).
CREATE INDEX "Asset_name_trgm_idx" ON "Asset" USING gin ("name" gin_trgm_ops);
CREATE INDEX "Asset_assetTag_trgm_idx" ON "Asset" USING gin ("assetTag" gin_trgm_ops);
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_typeId_fkey"
    FOREIGN KEY ("typeId") REFERENCES "AssetType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_assignedUserId_fkey"
    FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_organizationalUnitId_fkey"
    FOREIGN KEY ("organizationalUnitId") REFERENCES "OrganizationalUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "AssetLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_serviceId_fkey"
    FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "AssetRelation" (
    "id" TEXT NOT NULL,
    "fromAssetId" TEXT NOT NULL,
    "toAssetId" TEXT NOT NULL,
    "kind" "AssetRelationKind" NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssetRelation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AssetRelation_self_check" CHECK ("fromAssetId" <> "toAssetId")
);
CREATE UNIQUE INDEX "AssetRelation_fromAssetId_toAssetId_kind_key" ON "AssetRelation"("fromAssetId", "toAssetId", "kind");
CREATE INDEX "AssetRelation_toAssetId_idx" ON "AssetRelation"("toAssetId");
ALTER TABLE "AssetRelation" ADD CONSTRAINT "AssetRelation_fromAssetId_fkey"
    FOREIGN KEY ("fromAssetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssetRelation" ADD CONSTRAINT "AssetRelation_toAssetId_fkey"
    FOREIGN KEY ("toAssetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TicketAsset" (
    "ticketId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "linkedByUserId" TEXT,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TicketAsset_pkey" PRIMARY KEY ("ticketId", "assetId")
);
CREATE INDEX "TicketAsset_assetId_linkedAt_idx" ON "TicketAsset"("assetId", "linkedAt");
ALTER TABLE "TicketAsset" ADD CONSTRAINT "TicketAsset_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TicketAsset" ADD CONSTRAINT "TicketAsset_assetId_fkey"
    FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "AssetContract" (
    "id" TEXT NOT NULL,
    "kind" "AssetContractKind" NOT NULL DEFAULT 'WARRANTY',
    "supplier" VARCHAR(160) NOT NULL,
    "reference" VARCHAR(120),
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3) NOT NULL,
    "cost" DECIMAL(12,2),
    "notes" VARCHAR(4000),
    "organizationalUnitId" TEXT NOT NULL,
    "remindersSent" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AssetContract_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AssetContract_endsAt_idx" ON "AssetContract"("endsAt");
CREATE INDEX "AssetContract_organizationalUnitId_idx" ON "AssetContract"("organizationalUnitId");
ALTER TABLE "AssetContract" ADD CONSTRAINT "AssetContract_organizationalUnitId_fkey"
    FOREIGN KEY ("organizationalUnitId") REFERENCES "OrganizationalUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "AssetContractItem" (
    "contractId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    CONSTRAINT "AssetContractItem_pkey" PRIMARY KEY ("contractId", "assetId")
);
CREATE INDEX "AssetContractItem_assetId_idx" ON "AssetContractItem"("assetId");
ALTER TABLE "AssetContractItem" ADD CONSTRAINT "AssetContractItem_contractId_fkey"
    FOREIGN KEY ("contractId") REFERENCES "AssetContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssetContractItem" ADD CONSTRAINT "AssetContractItem_assetId_fkey"
    FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SoftwareLicense" (
    "id" TEXT NOT NULL,
    "productName" VARCHAR(160) NOT NULL,
    "vendor" VARCHAR(120),
    "kind" "SoftwareLicenseKind" NOT NULL DEFAULT 'PER_DEVICE',
    "seats" INTEGER,
    "validUntil" TIMESTAMP(3),
    "cost" DECIMAL(12,2),
    "notes" VARCHAR(4000),
    "keyEncrypted" TEXT,
    "organizationalUnitId" TEXT NOT NULL,
    "remindersSent" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SoftwareLicense_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SoftwareLicense_seats_check" CHECK ("seats" IS NULL OR "seats" >= 0)
);
CREATE INDEX "SoftwareLicense_validUntil_idx" ON "SoftwareLicense"("validUntil");
CREATE INDEX "SoftwareLicense_organizationalUnitId_idx" ON "SoftwareLicense"("organizationalUnitId");
ALTER TABLE "SoftwareLicense" ADD CONSTRAINT "SoftwareLicense_organizationalUnitId_fkey"
    FOREIGN KEY ("organizationalUnitId") REFERENCES "OrganizationalUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "LicenseAssignment" (
    "id" TEXT NOT NULL,
    "licenseId" TEXT NOT NULL,
    "assetId" TEXT,
    "userId" TEXT,
    "assignedByUserId" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LicenseAssignment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LicenseAssignment_target_check" CHECK (("assetId" IS NULL) <> ("userId" IS NULL))
);
CREATE UNIQUE INDEX "LicenseAssignment_licenseId_assetId_key" ON "LicenseAssignment"("licenseId", "assetId");
CREATE UNIQUE INDEX "LicenseAssignment_licenseId_userId_key" ON "LicenseAssignment"("licenseId", "userId");
CREATE INDEX "LicenseAssignment_assetId_idx" ON "LicenseAssignment"("assetId");
CREATE INDEX "LicenseAssignment_userId_idx" ON "LicenseAssignment"("userId");
ALTER TABLE "LicenseAssignment" ADD CONSTRAINT "LicenseAssignment_licenseId_fkey"
    FOREIGN KEY ("licenseId") REFERENCES "SoftwareLicense"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LicenseAssignment" ADD CONSTRAINT "LicenseAssignment_assetId_fkey"
    FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LicenseAssignment" ADD CONSTRAINT "LicenseAssignment_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AssetEvent" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "action" VARCHAR(40) NOT NULL,
    "actorUserId" TEXT,
    "detail" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssetEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AssetEvent_assetId_createdAt_idx" ON "AssetEvent"("assetId", "createdAt" DESC);
CREATE INDEX "AssetEvent_actorUserId_idx" ON "AssetEvent"("actorUserId");
ALTER TABLE "AssetEvent" ADD CONSTRAINT "AssetEvent_assetId_fkey"
    FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AssetImportJob" (
    "id" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "fileName" VARCHAR(255) NOT NULL,
    "fileSha256" VARCHAR(64) NOT NULL,
    "status" "AssetImportStatus" NOT NULL DEFAULT 'PREVIEW',
    "mode" "AssetImportMode" NOT NULL DEFAULT 'CREATE_ONLY',
    "allOrNothing" BOOLEAN NOT NULL DEFAULT false,
    "rows" JSONB,
    "totals" JSONB NOT NULL DEFAULT '{}',
    "errors" JSONB NOT NULL DEFAULT '[]',
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AssetImportJob_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AssetImportJob_createdByUserId_createdAt_idx" ON "AssetImportJob"("createdByUserId", "createdAt");
CREATE INDEX "AssetImportJob_fileSha256_idx" ON "AssetImportJob"("fileSha256");

-- Starter types (editable, can be archived). Fixed ids keep K4 packages stable.
INSERT INTO "AssetType" ("id", "key", "nameBs", "nameEn", "icon", "category", "isUserSelectable", "sortOrder", "updatedAt") VALUES
  ('asset-type-computer', 'computer', 'Računar', 'Computer', 'monitor', 'HARDWARE', true, 10, CURRENT_TIMESTAMP),
  ('asset-type-laptop', 'laptop', 'Laptop', 'Laptop', 'laptop', 'HARDWARE', true, 20, CURRENT_TIMESTAMP),
  ('asset-type-monitor', 'monitor', 'Monitor', 'Monitor', 'monitor', 'HARDWARE', true, 30, CURRENT_TIMESTAMP),
  ('asset-type-printer', 'printer', 'Štampač / MFP', 'Printer / MFP', 'printer', 'HARDWARE', true, 40, CURRENT_TIMESTAMP),
  ('asset-type-phone', 'phone', 'Mobilni telefon', 'Mobile phone', 'smartphone', 'HARDWARE', true, 50, CURRENT_TIMESTAMP),
  ('asset-type-tablet', 'tablet', 'Tablet', 'Tablet', 'tablet', 'HARDWARE', true, 60, CURRENT_TIMESTAMP),
  ('asset-type-network', 'network-device', 'Mrežni uređaj', 'Network device', 'router', 'NETWORK', false, 70, CURRENT_TIMESTAMP),
  ('asset-type-server', 'server', 'Server', 'Server', 'server', 'INFRASTRUCTURE', false, 80, CURRENT_TIMESTAMP),
  ('asset-type-vm', 'virtual-machine', 'Virtuelna mašina', 'Virtual machine', 'cloud', 'INFRASTRUCTURE', false, 90, CURRENT_TIMESTAMP),
  ('asset-type-application', 'application', 'Aplikacija', 'Application', 'app-window', 'SOFTWARE', true, 100, CURRENT_TIMESTAMP),
  ('asset-type-peripheral', 'peripheral', 'Periferija', 'Peripheral', 'keyboard', 'HARDWARE', true, 110, CURRENT_TIMESTAMP),
  ('asset-type-other', 'other', 'Ostalo', 'Other', 'box', 'OTHER', true, 120, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "AssetAttribute" ("id", "typeId", "key", "labelBs", "labelEn", "dataType", "options", "isRequired", "isUnique", "sortOrder", "updatedAt") VALUES
  ('asset-attr-computer-cpu', 'asset-type-computer', 'cpu', 'Procesor', 'CPU', 'TEXT', NULL, false, false, 10, CURRENT_TIMESTAMP),
  ('asset-attr-computer-ram', 'asset-type-computer', 'ramGb', 'RAM (GB)', 'RAM (GB)', 'NUMBER', NULL, false, false, 20, CURRENT_TIMESTAMP),
  ('asset-attr-computer-disk', 'asset-type-computer', 'diskGb', 'Disk (GB)', 'Disk (GB)', 'NUMBER', NULL, false, false, 30, CURRENT_TIMESTAMP),
  ('asset-attr-computer-os', 'asset-type-computer', 'os', 'Operativni sistem', 'Operating system', 'TEXT', NULL, false, false, 40, CURRENT_TIMESTAMP),
  ('asset-attr-computer-host', 'asset-type-computer', 'hostname', 'Naziv računara', 'Hostname', 'TEXT', NULL, false, true, 50, CURRENT_TIMESTAMP),
  ('asset-attr-computer-mac', 'asset-type-computer', 'macAddress', 'MAC adresa', 'MAC address', 'TEXT', NULL, false, false, 60, CURRENT_TIMESTAMP),
  ('asset-attr-laptop-cpu', 'asset-type-laptop', 'cpu', 'Procesor', 'CPU', 'TEXT', NULL, false, false, 10, CURRENT_TIMESTAMP),
  ('asset-attr-laptop-ram', 'asset-type-laptop', 'ramGb', 'RAM (GB)', 'RAM (GB)', 'NUMBER', NULL, false, false, 20, CURRENT_TIMESTAMP),
  ('asset-attr-laptop-disk', 'asset-type-laptop', 'diskGb', 'Disk (GB)', 'Disk (GB)', 'NUMBER', NULL, false, false, 30, CURRENT_TIMESTAMP),
  ('asset-attr-laptop-os', 'asset-type-laptop', 'os', 'Operativni sistem', 'Operating system', 'TEXT', NULL, false, false, 40, CURRENT_TIMESTAMP),
  ('asset-attr-laptop-host', 'asset-type-laptop', 'hostname', 'Naziv računara', 'Hostname', 'TEXT', NULL, false, true, 50, CURRENT_TIMESTAMP),
  ('asset-attr-monitor-size', 'asset-type-monitor', 'sizeInch', 'Dijagonala (")', 'Size (")', 'NUMBER', NULL, false, false, 10, CURRENT_TIMESTAMP),
  ('asset-attr-printer-ip', 'asset-type-printer', 'ipAddress', 'IP adresa', 'IP address', 'TEXT', NULL, false, false, 10, CURRENT_TIMESTAMP),
  ('asset-attr-printer-toner', 'asset-type-printer', 'tonerModel', 'Model tonera', 'Toner model', 'TEXT', NULL, false, false, 20, CURRENT_TIMESTAMP),
  ('asset-attr-printer-color', 'asset-type-printer', 'color', 'U boji', 'Colour', 'BOOLEAN', NULL, false, false, 30, CURRENT_TIMESTAMP),
  ('asset-attr-phone-imei', 'asset-type-phone', 'imei', 'IMEI', 'IMEI', 'TEXT', NULL, false, true, 10, CURRENT_TIMESTAMP),
  ('asset-attr-phone-number', 'asset-type-phone', 'phoneNumber', 'Broj telefona', 'Phone number', 'TEXT', NULL, false, false, 20, CURRENT_TIMESTAMP),
  ('asset-attr-server-ip', 'asset-type-server', 'ipAddress', 'IP adresa', 'IP address', 'TEXT', NULL, false, false, 10, CURRENT_TIMESTAMP),
  ('asset-attr-server-os', 'asset-type-server', 'os', 'Operativni sistem', 'Operating system', 'TEXT', NULL, false, false, 20, CURRENT_TIMESTAMP),
  ('asset-attr-server-env', 'asset-type-server', 'environment', 'Okruženje', 'Environment', 'SELECT', '["production","staging","test","development"]', false, false, 30, CURRENT_TIMESTAMP),
  ('asset-attr-vm-ip', 'asset-type-vm', 'ipAddress', 'IP adresa', 'IP address', 'TEXT', NULL, false, false, 10, CURRENT_TIMESTAMP),
  ('asset-attr-vm-env', 'asset-type-vm', 'environment', 'Okruženje', 'Environment', 'SELECT', '["production","staging","test","development"]', false, false, 20, CURRENT_TIMESTAMP),
  ('asset-attr-app-version', 'asset-type-application', 'version', 'Verzija', 'Version', 'TEXT', NULL, false, false, 10, CURRENT_TIMESTAMP),
  ('asset-attr-app-url', 'asset-type-application', 'url', 'Adresa (URL)', 'URL', 'TEXT', NULL, false, false, 20, CURRENT_TIMESTAMP),
  ('asset-attr-network-ip', 'asset-type-network', 'ipAddress', 'IP adresa', 'IP address', 'TEXT', NULL, false, false, 10, CURRENT_TIMESTAMP)
ON CONFLICT ("typeId", "key") DO NOTHING;

-- Permissions (7). SUPER_ADMIN holds every permission implicitly.
INSERT INTO "Permission" ("id", "key", "description")
SELECT gen_random_uuid()::text, k.key, k.key
FROM (VALUES ('asset.read'), ('asset.manage'), ('asset.import'), ('asset.license.manage'),
             ('asset.contract.manage'), ('asset.type.manage'), ('asset.report.read')) AS k(key)
ON CONFLICT ("key") DO NOTHING;

-- ASSET_MANAGER: added next to USER (e.g. procurement), scoped by unit.
INSERT INTO "Role" ("id", "key", "name", "isSystem", "updatedAt")
VALUES (gen_random_uuid()::text, 'ASSET_MANAGER', 'AssetManager', true, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "RolePermission" ("id", "roleId", "permissionId")
SELECT gen_random_uuid()::text, r."id", p."id"
FROM "Role" r
INNER JOIN "Permission" p ON (
     (r."key" = 'AGENT' AND p."key" IN ('asset.read', 'asset.manage'))
  OR (r."key" = 'ASSET_MANAGER' AND p."key" IN ('asset.read', 'asset.manage', 'asset.import',
        'asset.license.manage', 'asset.contract.manage', 'asset.report.read'))
  OR (r."key" = 'ADMIN' AND p."key" IN ('asset.read', 'asset.manage', 'asset.import',
        'asset.license.manage', 'asset.contract.manage', 'asset.type.manage', 'asset.report.read'))
)
WHERE NOT EXISTS (
    SELECT 1 FROM "RolePermission" e WHERE e."roleId" = r."id" AND e."permissionId" = p."id"
);
