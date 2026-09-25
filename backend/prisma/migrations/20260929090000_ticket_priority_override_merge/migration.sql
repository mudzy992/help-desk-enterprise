-- Package 1.2: manual priority override and merge metadata (additive).
ALTER TYPE "ParticipantRole" ADD VALUE IF NOT EXISTS 'MERGED_REQUESTER';

ALTER TABLE "Ticket" ADD COLUMN "priorityOverridden" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Ticket" ADD COLUMN "priorityOverriddenAt" TIMESTAMP(3);
ALTER TABLE "Ticket" ADD COLUMN "priorityOverriddenById" TEXT;
ALTER TABLE "Ticket" ADD COLUMN "mergedAt" TIMESTAMP(3);
ALTER TABLE "Ticket" ADD COLUMN "mergedById" TEXT;
