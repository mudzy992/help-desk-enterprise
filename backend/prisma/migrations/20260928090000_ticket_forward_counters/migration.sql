-- Package 1.6: denormalised forward counters on Ticket (additive, backfilled).
ALTER TABLE "Ticket" ADD COLUMN "forwardCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Ticket" ADD COLUMN "lastForwardedAt" TIMESTAMP(3);
ALTER TABLE "Ticket" ADD COLUMN "lastForwardFromGroupName" TEXT;

-- Group-to-group forwards only (a reassignment inside the same group does not count).
UPDATE "Ticket" AS t
SET "forwardCount" = f.cnt,
    "lastForwardedAt" = f.last_at,
    "lastForwardFromGroupName" = f.last_from
FROM (
  SELECT DISTINCT ON ("ticketId")
    "ticketId",
    COUNT(*) OVER (PARTITION BY "ticketId") AS cnt,
    "createdAt" AS last_at,
    "fromGroupName" AS last_from
  FROM "TicketForwardEvent"
  WHERE "fromGroupId" IS DISTINCT FROM "toGroupId"
  ORDER BY "ticketId", "createdAt" DESC
) AS f
WHERE t."id" = f."ticketId";
