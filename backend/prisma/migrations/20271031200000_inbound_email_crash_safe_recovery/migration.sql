CREATE TYPE "InboundEmailProcessingPhase" AS ENUM (
    'CLAIMED',
    'RAW_STORED',
    'PARSED',
    'TICKET_MUTATION',
    'TICKET_WRITTEN',
    'ATTACHMENTS',
    'READY_TO_FINALIZE'
);

ALTER TABLE "InboundEmail"
    ADD COLUMN "processingPhase" "InboundEmailProcessingPhase",
    ADD COLUMN "processingOwnerToken" UUID,
    ADD COLUMN "processingLeaseExpiresAt" TIMESTAMP(3);

CREATE INDEX "InboundEmail_status_processingLeaseExpiresAt_idx"
    ON "InboundEmail"("status", "processingLeaseExpiresAt");

ALTER TABLE "Ticket"
    ADD COLUMN "sourceInboundEmailId" VARCHAR(64);

CREATE UNIQUE INDEX "Ticket_sourceInboundEmailId_key"
    ON "Ticket"("sourceInboundEmailId");

ALTER TABLE "TicketAttachment"
    ADD COLUMN "idempotencyKey" VARCHAR(128),
    ADD COLUMN "payloadHash" CHAR(64);

CREATE UNIQUE INDEX "TicketAttachment_ticketId_idempotencyKey_key"
    ON "TicketAttachment"("ticketId", "idempotencyKey");
