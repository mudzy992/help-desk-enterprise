-- AlterTable TicketSlaState
ALTER TABLE "TicketSlaState" ADD COLUMN "firedEscalationKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
