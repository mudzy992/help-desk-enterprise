ALTER TABLE "TicketMessage" ADD COLUMN "idempotencyKey" VARCHAR(128);
CREATE UNIQUE INDEX "TicketMessage_ticketId_idempotencyKey_key" ON "TicketMessage"("ticketId", "idempotencyKey");
