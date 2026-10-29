-- W7.8 / BA-assets-08: make the primary TicketAsset link a database invariant.
-- Fail closed on legacy rows rather than silently choosing a primary during
-- deploy. The closeout runbook provides an explicit, deterministic repair SQL.
-- The table lock keeps the preflight and trigger/index installation atomic.
BEGIN;
LOCK TABLE "TicketAsset" IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  invalid_group RECORD;
BEGIN
  SELECT
    link."ticketId",
    count(*) AS "linkCount",
    count(*) FILTER (WHERE link."isPrimary" = TRUE) AS "primaryCount"
  INTO invalid_group
  FROM "TicketAsset" AS link
  GROUP BY link."ticketId"
  HAVING count(*) FILTER (WHERE link."isPrimary" = TRUE) <> 1
  ORDER BY link."ticketId"
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'cannot install BA-assets-08 invariant: ticket % has % asset links and % primary links; run the documented deterministic reconciliation and retry',
      invalid_group."ticketId",
      invalid_group."linkCount",
      invalid_group."primaryCount"
      USING ERRCODE = '23514',
            CONSTRAINT = 'TicketAsset_primary_required',
            TABLE = 'TicketAsset';
  END IF;
END;
$$;

-- At most one primary per ticket is represented as a partial unique index;
-- the deferred trigger below supplies the complementary "at least one while
-- links exist" half of the invariant.
CREATE UNIQUE INDEX "TicketAsset_one_primary_per_ticket_key"
  ON "TicketAsset" ("ticketId")
  WHERE "isPrimary" = TRUE;

-- Serialize every row-level link mutation on the parent ticket. For a ticketId
-- move, acquire both parent locks in database order to avoid lock-order cycles.
CREATE FUNCTION "lock_ticket_asset_primary_group"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM 1 FROM "Ticket" WHERE "id" = NEW."ticketId" FOR UPDATE;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM 1 FROM "Ticket" WHERE "id" = OLD."ticketId" FOR UPDATE;
    RETURN OLD;
  ELSE
    PERFORM 1
    FROM "Ticket"
    WHERE "id" = OLD."ticketId" OR "id" = NEW."ticketId"
    ORDER BY "id"
    FOR UPDATE;
    RETURN NEW;
  END IF;
END;
$$;

CREATE TRIGGER "TicketAsset_primary_group_lock"
BEFORE INSERT OR UPDATE OR DELETE ON "TicketAsset"
FOR EACH ROW
EXECUTE FUNCTION "lock_ticket_asset_primary_group"();

CREATE FUNCTION "assert_ticket_asset_primary_group"(p_ticket_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  link_count BIGINT;
  primary_count BIGINT;
BEGIN
  SELECT
    count(*),
    count(*) FILTER (WHERE "isPrimary" = TRUE)
  INTO link_count, primary_count
  FROM "TicketAsset"
  WHERE "ticketId" = p_ticket_id;

  IF link_count = 0 THEN
    RETURN;
  END IF;

  IF primary_count <> 1 THEN
    RAISE EXCEPTION
      'TicketAsset_primary_required: ticket % with asset links must have exactly one primary link',
      p_ticket_id
      USING ERRCODE = '23514',
            CONSTRAINT = 'TicketAsset_primary_required',
            TABLE = 'TicketAsset';
  END IF;
END;
$$;

CREATE FUNCTION "check_ticket_asset_primary_after_write"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM "assert_ticket_asset_primary_group"(NEW."ticketId");
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM "assert_ticket_asset_primary_group"(OLD."ticketId");
  ELSE
    PERFORM "assert_ticket_asset_primary_group"(OLD."ticketId");
    IF NEW."ticketId" IS DISTINCT FROM OLD."ticketId" THEN
      PERFORM "assert_ticket_asset_primary_group"(NEW."ticketId");
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

-- Deferred because application link/unlink/set-primary operations temporarily
-- pass through zero-primary state inside their transaction before restoring a
-- single primary. Invalid final states abort at commit and roll back atomically.
CREATE CONSTRAINT TRIGGER "TicketAsset_primary_required"
AFTER INSERT OR UPDATE OR DELETE ON "TicketAsset"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "check_ticket_asset_primary_after_write"();

COMMIT;
