import { appendAuditLog } from '../audit-log/append-audit-log';
import { auditLogActions, auditLogEntityTypes } from '../audit-log/audit-log.constants';
import type { AuditLogWriteClient } from '../audit-log/audit-log.types';
import type { JsonValue } from '../change-log/change-log.types';

export type ManualDirectoryCatalogChangeAction =
  | typeof auditLogActions.directoryCatalogUnitCreated
  | typeof auditLogActions.directoryCatalogUnitUpdated
  | typeof auditLogActions.directoryCatalogUnitDeleted;

/**
 * W2.35b: the audit trail of the **manual directory catalog**.
 *
 * The catalog is a staging tree of directory rows (`ManualDirectoryOrganizationalUnit`),
 * not the authorization model's `OrganizationalUnit`: a row becomes an OU only when a
 * read materializes it (`materialize-directory-read.ts`), and that OU write has its own
 * entity-scoped audit. Writing catalog changes as `organizational_unit.created` claimed
 * an OU identity that did not exist yet — `prepareAuditEntry` rejected it with
 * `AUDIT_SCOPE_REQUIRED`, so creating an OU from the directory screen failed with 500
 * and the whole transaction rolled back. The entry is installation-level (global scope),
 * so it carries no `organizationalUnitId` by design.
 */
export async function recordManualDirectoryCatalogChange(
  transaction: AuditLogWriteClient,
  input: {
    readonly action: ManualDirectoryCatalogChangeAction;
    readonly entityId: string;
    readonly actorUserId: string | null;
    readonly requestId: string | null;
    readonly metadata: JsonValue;
  },
): Promise<void> {
  await appendAuditLog(transaction, {
    action: input.action,
    entityType: auditLogEntityTypes.directoryCatalogEntry,
    entityId: input.entityId,
    actorUserId: input.actorUserId,
    requestId: input.requestId,
    organizationalUnitId: null,
    metadata: input.metadata,
  });
}
