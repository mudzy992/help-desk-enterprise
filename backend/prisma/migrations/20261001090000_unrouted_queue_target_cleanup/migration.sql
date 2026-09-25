-- Package 1.7: unrouted queue target group and cleanup warning (additive).
ALTER TABLE "Ticket" ADD COLUMN "routedByUnroutedFallback" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Ticket" ADD COLUMN "unroutedWarnedAt" TIMESTAMP(3);
