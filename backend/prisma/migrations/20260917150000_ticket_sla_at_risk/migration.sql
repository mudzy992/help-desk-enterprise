-- AlterTable
ALTER TABLE "TicketSlaState" ADD COLUMN "isResponseAtRisk" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TicketSlaState" ADD COLUMN "isResolutionAtRisk" BOOLEAN NOT NULL DEFAULT false;
