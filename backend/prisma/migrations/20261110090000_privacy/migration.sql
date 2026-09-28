-- Paket 2.6: zaštita ličnih podataka (ZZLP BiH).

-- Audit hash v2, redaction marker (design §6.5).
ALTER TABLE "AuditLog" ADD COLUMN "hashVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "AuditLog" ADD COLUMN "metadataDigest" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "redactedAt" TIMESTAMP(3);

ALTER TABLE "TicketMessage" ADD COLUMN "redactedAt" TIMESTAMP(3);

ALTER TABLE "Ticket" ADD COLUMN "contentRedactedAt" TIMESTAMP(3);
ALTER TABLE "Ticket" ADD COLUMN "attachmentsPurgedAt" TIMESTAMP(3);
ALTER TABLE "Ticket" ADD COLUMN "legalHoldAt" TIMESTAMP(3);
ALTER TABLE "Ticket" ADD COLUMN "legalHoldReason" VARCHAR(500);
ALTER TABLE "Ticket" ADD COLUMN "legalHoldById" TEXT;

ALTER TABLE "User" ADD COLUMN "anonymizedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "legalHoldAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "legalHoldReason" VARCHAR(500);

CREATE TABLE "DataSubjectRequest" (
    "id" TEXT NOT NULL,
    "type" VARCHAR(24) NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "subjectUserId" TEXT,
    "subjectLabel" VARCHAR(200) NOT NULL,
    "channel" VARCHAR(16) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "extendedDueAt" TIMESTAMP(3),
    "extensionReason" VARCHAR(1000),
    "rejectionReason" VARCHAR(1000),
    "handlerUserId" TEXT,
    "notes" VARCHAR(4000),
    "resultRef" VARCHAR(300),
    "remindersSent" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "closedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DataSubjectRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DataSubjectRequest_status_dueAt_idx" ON "DataSubjectRequest"("status", "dueAt");
CREATE INDEX "DataSubjectRequest_subjectUserId_idx" ON "DataSubjectRequest"("subjectUserId");
CREATE INDEX "DataSubjectRequest_closedAt_idx" ON "DataSubjectRequest"("closedAt");

CREATE TABLE "PrivacyErasure" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pseudonym" VARCHAR(64) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "tombstones" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "deleteOwnAttachments" BOOLEAN NOT NULL DEFAULT false,
    "requestId" TEXT,
    "preview" JSONB,
    "report" JSONB,
    "error" VARCHAR(1000),
    "requestedByUserId" TEXT,
    "approvedByUserId" TEXT,
    "approvalDeadline" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PrivacyErasure_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PrivacyErasure_userId_idx" ON "PrivacyErasure"("userId");
CREATE INDEX "PrivacyErasure_status_createdAt_idx" ON "PrivacyErasure"("status", "createdAt");
CREATE INDEX "PrivacyErasure_tombstones_idx" ON "PrivacyErasure" USING GIN ("tombstones");

CREATE TABLE "PrivacyExport" (
    "id" TEXT NOT NULL,
    "subjectUserId" TEXT NOT NULL,
    "requestId" TEXT,
    "status" VARCHAR(16) NOT NULL,
    "includeAttachments" BOOLEAN NOT NULL DEFAULT true,
    "includeInternalNotes" BOOLEAN NOT NULL DEFAULT false,
    "internalNotesReason" VARCHAR(1000),
    "storageKey" VARCHAR(300),
    "sizeBytes" INTEGER,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "error" VARCHAR(1000),
    "requestedByUserId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PrivacyExport_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PrivacyExport_status_expiresAt_idx" ON "PrivacyExport"("status", "expiresAt");
CREATE INDEX "PrivacyExport_subjectUserId_idx" ON "PrivacyExport"("subjectUserId");

CREATE TABLE "RetentionRun" (
    "id" TEXT NOT NULL,
    "category" VARCHAR(32) NOT NULL,
    "mode" VARCHAR(8) NOT NULL,
    "status" VARCHAR(10) NOT NULL,
    "configDays" INTEGER,
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "bytesFreed" BIGINT NOT NULL DEFAULT 0,
    "oldestAt" TIMESTAMP(3),
    "newestAt" TIMESTAMP(3),
    "refs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "refsTruncated" BOOLEAN NOT NULL DEFAULT false,
    "error" VARCHAR(1000),
    "triggeredByUserId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    CONSTRAINT "RetentionRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RetentionRun_category_mode_startedAt_idx" ON "RetentionRun"("category", "mode", "startedAt" DESC);
CREATE INDEX "RetentionRun_startedAt_idx" ON "RetentionRun"("startedAt");

CREATE TABLE "AuditChainCheckpoint" (
    "id" TEXT NOT NULL,
    "throughId" TEXT NOT NULL,
    "throughCreatedAt" TIMESTAMP(3) NOT NULL,
    "throughHash" TEXT NOT NULL,
    "purgedCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditChainCheckpoint_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AuditChainCheckpoint_createdAt_idx" ON "AuditChainCheckpoint"("createdAt");

-- Retention scans (design §7.3): sessions by age, e-mail deliveries by age,
-- messages by author (export/anonymization), activities by actor exist.
CREATE INDEX IF NOT EXISTS "UserSession_lastSeenAt_idx" ON "UserSession"("lastSeenAt");
CREATE INDEX IF NOT EXISTS "NotificationEmailDelivery_createdAt_idx" ON "NotificationEmailDelivery"("createdAt");
