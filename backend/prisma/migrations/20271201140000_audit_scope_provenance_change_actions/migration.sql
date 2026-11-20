-- W7.67 / BA-changes-11 (P2): the canonical audit rows for a general change
-- edit and for a claim must be partitioned into the change's own unit, and the
-- database has to enforce that like it does for `change.created` and
-- `change.status_changed`. Both new actions were added to
-- `auditActionScopeRegistry` as entity-scoped, so the guard spec
-- `audit-scope-provenance-whitelist.spec.ts` requires this whitelist to know
-- them; without it their scope would only be correct by construction.
--
-- The function is replaced, not recreated: the trigger "AuditLog_scope_provenance"
-- keeps pointing at it, no row is left unguarded during the swap and no data is
-- rewritten. Everything outside the change branch is byte-for-byte the previous
-- definition.
CREATE OR REPLACE FUNCTION "enforce_audit_scope_provenance"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  canonical_scope text;
BEGIN
  IF NEW."action" IN (
    'ticket_confidential_viewed', 'ticket_confidential_denied', 'ticket_confidential_break_glass',
    'ticket.forwarded', 'ticket.priority_overridden', 'ticket.merged', 'ticket.unmerged',
    'ticket.remote.acknowledged', 'ticket.message_created'
  ) THEN
    SELECT "originUnitId" INTO canonical_scope FROM "Ticket" WHERE "id" = NEW."entityId";
  ELSIF NEW."action" IN ('group.updated', 'group.member_added', 'group.member_removed') THEN
    SELECT "organizationalUnitId" INTO canonical_scope FROM "Group" WHERE "id" = NEW."entityId";
  ELSIF NEW."action" IN ('organizational_unit.created', 'organizational_unit.updated') THEN
    SELECT "id" INTO canonical_scope FROM "OrganizationalUnit" WHERE "id" = NEW."entityId";
  ELSIF NEW."action" IN (
    'problem.created', 'problem.updated', 'problem.claimed',
    'problem.status_changed', 'problem.closed', 'problem.cancelled',
    'problem.reopened', 'problem.knowledge_article_created', 'problem.tickets_resolved'
  ) THEN
    SELECT "organizationalUnitId" INTO canonical_scope FROM "Problem" WHERE "id" = NEW."entityId";
  ELSIF NEW."action" IN (
    'change.created', 'change.status_changed', 'change.approval_recorded',
    'change.updated', 'change.claimed'
  ) THEN
    SELECT "organizationalUnitId" INTO canonical_scope FROM "ChangeRequest" WHERE "id" = NEW."entityId";
  ELSIF NEW."action" IN ('asset.retired', 'asset.disposed') THEN
    SELECT "organizationalUnitId" INTO canonical_scope FROM "Asset" WHERE "id" = NEW."entityId";
  ELSE
    RETURN NEW;
  END IF;

  IF canonical_scope IS NULL THEN
    RAISE EXCEPTION 'AUDIT_SCOPE_ENTITY_NOT_FOUND:%:%', NEW."action", NEW."entityId" USING ERRCODE = '23514';
  END IF;
  IF NEW."organizationalUnitId" IS DISTINCT FROM canonical_scope THEN
    RAISE EXCEPTION 'AUDIT_SCOPE_PROVENANCE_MISMATCH:%:%:%', NEW."action", NEW."organizationalUnitId", canonical_scope USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
