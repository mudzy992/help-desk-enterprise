-- CreateIndex
CREATE INDEX "TicketParticipant_ticketId_role_idx" ON "TicketParticipant"("ticketId", "role");

-- CreateIndex
CREATE INDEX "TicketMessage_ticketId_type_idx" ON "TicketMessage"("ticketId", "type");

-- CreateIndex
CREATE INDEX "TicketMessage_ticketId_createdAt_idx" ON "TicketMessage"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "TicketTimeLog_userId_ticketId_idx" ON "TicketTimeLog"("userId", "ticketId");

-- One active timer per user+ticket. Completed rows stay unconstrained.
CREATE UNIQUE INDEX "TicketTimeLog_active_user_ticket_uidx" ON "TicketTimeLog"("userId", "ticketId") WHERE "endedAt" IS NULL;
