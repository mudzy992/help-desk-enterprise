-- CreateIndex
CREATE INDEX "Ticket_parentTicketId_idx" ON "Ticket"("parentTicketId");

-- CreateIndex
CREATE INDEX "Ticket_mergedIntoTicketId_idx" ON "Ticket"("mergedIntoTicketId");

-- CreateIndex
CREATE INDEX "SavedView_userId_idx" ON "SavedView"("userId");
