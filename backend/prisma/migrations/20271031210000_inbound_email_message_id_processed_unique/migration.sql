-- BA-inbound-email-07: Message-ID dedupe was read-before-write. At most one
-- PROCESSED row may exist per (mailboxKey, messageIdHeader); concurrent
-- duplicate deliveries collide at finish time instead of both succeeding.
-- Creating this index fails if historical PROCESSED duplicates already
-- exist; resolve those rows before applying the migration.
CREATE UNIQUE INDEX "InboundEmail_mailboxKey_messageIdHeader_processed_key"
    ON "InboundEmail" ("mailboxKey", "messageIdHeader")
    WHERE "messageIdHeader" IS NOT NULL AND "status" = 'PROCESSED';
