-- W7.38 / BA-problems-20 (P2): the audit provenance trigger knew the problem
-- actions that existed when it was introduced (20271025140000_audit_scope_provenance),
-- but not the two canonical actions W7.30 added for general update and claim.
-- Their scope was therefore only correct by construction (same row, same
-- transaction) and not enforced by the database.
--
-- The guard spec also found a second, older drift of the same kind: the
-- collaboration service writes `ticket.message_created` with the ticket's
-- origin unit (tickets-collaboration.service.ts), and the registry calls it
-- entity-scoped, but the trigger never checked it. It is covered here too, so
-- the whitelist and the code agree for every action.
--
-- The function is replaced, not recreated: the trigger "AuditLog_scope_provenance"
-- keeps pointing at it, so no row is left unguarded during the swap and no data is
-- rewritten. Everything outside the problem branch is byte-for-byte the previous
-- definition; the guard spec `audit-scope-provenance-whitelist.spec.ts` keeps this
-- list in step with `auditActionScopeRegistry` from now on.
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
  ELSIF NEW."action" IN ('change.created', 'change.status_changed', 'change.approval_recorded') THEN
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
