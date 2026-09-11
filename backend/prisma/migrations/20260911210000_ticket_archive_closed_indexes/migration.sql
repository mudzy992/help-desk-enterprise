-- CreateIndex
CREATE INDEX "Ticket_status_closedAt_idx" ON "Ticket"("status", "closedAt");

-- CreateIndex
CREATE INDEX "Ticket_archivedAt_idx" ON "Ticket"("archivedAt");
