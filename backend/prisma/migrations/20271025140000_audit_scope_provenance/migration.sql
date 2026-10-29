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
    'ticket.remote.acknowledged'
  ) THEN
    SELECT "originUnitId" INTO canonical_scope FROM "Ticket" WHERE "id" = NEW."entityId";
  ELSIF NEW."action" IN ('group.updated', 'group.member_added', 'group.member_removed') THEN
    SELECT "organizationalUnitId" INTO canonical_scope FROM "Group" WHERE "id" = NEW."entityId";
  ELSIF NEW."action" IN ('organizational_unit.created', 'organizational_unit.updated') THEN
    SELECT "id" INTO canonical_scope FROM "OrganizationalUnit" WHERE "id" = NEW."entityId";
  ELSIF NEW."action" IN (
    'problem.created', 'problem.status_changed', 'problem.closed', 'problem.cancelled',
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

CREATE TRIGGER "AuditLog_scope_provenance"
BEFORE INSERT ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION "enforce_audit_scope_provenance"();
