-- BA-notifications-01: make the main notification fan-out intent durable in
-- the same transaction as every newly committed ticket message. No historical
-- backfill is done: old messages cannot be classified as missed versus already
-- delivered without risking a duplicate notification storm.
CREATE OR REPLACE FUNCTION "enqueue_notification_ticket_message_fanout"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  event_payload jsonb;
BEGIN
  event_payload := jsonb_build_object(
    'ticketId', NEW."ticketId",
    'messageId', NEW."id"
  );
  INSERT INTO "OutboxMessage"
    ("id", "topic", "dedupeKey", "payload", "payloadHash", "status", "attempts", "maxAttempts", "nextAttemptAt", "createdAt", "updatedAt", "expiresAt")
  VALUES
    (gen_random_uuid(), 'notification.ticket-message.fanout', NEW."id", event_payload,
     md5(event_payload::text) || md5(event_payload::text), 'PENDING', 0, 10,
     NOW(), NOW(), NOW(), NOW() + INTERVAL '7 days')
  ON CONFLICT ("topic", "dedupeKey") DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "TicketMessage_notification_fanout_outbox"
AFTER INSERT ON "TicketMessage"
FOR EACH ROW EXECUTE FUNCTION "enqueue_notification_ticket_message_fanout"();
