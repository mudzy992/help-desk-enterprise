-- W5.12: every committed ticket message and SLA-relevant ticket mutation gets
-- a durable delivery intent in the same PostgreSQL transaction.
CREATE OR REPLACE FUNCTION "enqueue_ticket_message_effect"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  event_payload jsonb;
BEGIN
  event_payload := jsonb_build_object('ticketId', NEW."ticketId", 'messageId', NEW."id");
  INSERT INTO "OutboxMessage"
    ("id", "topic", "dedupeKey", "payload", "payloadHash", "status", "attempts", "maxAttempts", "nextAttemptAt", "createdAt", "updatedAt", "expiresAt")
  VALUES
    (gen_random_uuid(), 'ticket.message.delivery', NEW."id", event_payload,
     md5(event_payload::text) || md5(event_payload::text), 'PENDING', 0, 10, NOW(), NOW(), NOW(), NOW() + INTERVAL '7 days')
  ON CONFLICT ("topic", "dedupeKey") DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "TicketMessage_effect_outbox"
AFTER INSERT ON "TicketMessage"
FOR EACH ROW EXECUTE FUNCTION "enqueue_ticket_message_effect"();

CREATE OR REPLACE FUNCTION "enqueue_ticket_sla_effect"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  event_payload jsonb;
  event_key text;
BEGIN
  IF NEW."status" IS NOT DISTINCT FROM OLD."status"
     AND NEW."priority" IS NOT DISTINCT FROM OLD."priority" THEN
    RETURN NEW;
  END IF;
  event_payload := jsonb_build_object(
    'ticketId', NEW."id",
    'previousStatus', OLD."status",
    'statusChanged', NEW."status" IS DISTINCT FROM OLD."status",
    'priorityChanged', NEW."priority" IS DISTINCT FROM OLD."priority",
    'occurredAt', NEW."updatedAt"
  );
  event_key := NEW."id" || ':' || extract(epoch FROM NEW."updatedAt")::text || ':' || NEW."status"::text || ':' || NEW."priority"::text;
  INSERT INTO "OutboxMessage"
    ("id", "topic", "dedupeKey", "payload", "payloadHash", "status", "attempts", "maxAttempts", "nextAttemptAt", "createdAt", "updatedAt", "expiresAt")
  VALUES
    (gen_random_uuid(), 'ticket.sla.effects', event_key, event_payload,
     md5(event_payload::text) || md5(event_payload::text), 'PENDING', 0, 10, NOW(), NOW(), NOW(), NOW() + INTERVAL '7 days')
  ON CONFLICT ("topic", "dedupeKey") DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "Ticket_sla_effect_outbox"
AFTER UPDATE OF "status", "priority" ON "Ticket"
FOR EACH ROW EXECUTE FUNCTION "enqueue_ticket_sla_effect"();
