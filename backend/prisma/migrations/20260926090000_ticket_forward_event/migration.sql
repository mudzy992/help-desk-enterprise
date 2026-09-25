-- Package 1.1 (ticket forwarding): history of forwards between groups/OUs.
CREATE TABLE "TicketForwardEvent" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "fromGroupId" TEXT,
    "fromGroupName" TEXT,
    "fromUnitId" TEXT,
    "toGroupId" TEXT NOT NULL,
    "toGroupName" TEXT NOT NULL,
    "toUnitId" TEXT NOT NULL,
    "toUserId" TEXT,
    "previousAssigneeId" TEXT,
    "actorUserId" TEXT,
    "reason" TEXT NOT NULL,
    "isCrossOu" BOOLEAN NOT NULL,
    "requesterNotified" BOOLEAN NOT NULL DEFAULT false,
    "viaBulk" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketForwardEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TicketForwardEvent_ticketId_createdAt_idx" ON "TicketForwardEvent"("ticketId", "createdAt");
CREATE INDEX "TicketForwardEvent_toUnitId_createdAt_idx" ON "TicketForwardEvent"("toUnitId", "createdAt");
CREATE INDEX "TicketForwardEvent_toGroupId_createdAt_idx" ON "TicketForwardEvent"("toGroupId", "createdAt");

ALTER TABLE "TicketForwardEvent" ADD CONSTRAINT "TicketForwardEvent_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
