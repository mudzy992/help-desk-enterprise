import { appendAuditLog } from '../audit-log/append-audit-log';
import { auditLogActions, auditLogEntityTypes } from '../audit-log/audit-log.constants';
import type { AuditLogWriteClient } from '../audit-log/audit-log.types';
import type { JsonValue } from '../change-log/change-log.types';

export type OrganizationalUnitChangeAction =
  | typeof auditLogActions.organizationalUnitCreated
  | typeof auditLogActions.organizationalUnitUpdated
  | typeof auditLogActions.organizationalUnitDeleted;

export async function recordOrganizationalUnitChange(
  transaction: AuditLogWriteClient,
  input: {
    readonly action: OrganizationalUnitChangeAction;
    readonly entityId: string;
    readonly actorUserId: string | null;
    readonly requestId: string | null;
    readonly metadata: JsonValue;
    readonly organizationalUnitId?: string | null;
  },
): Promise<void> {
  await appendAuditLog(transaction, {
    action: input.action,
    entityType: auditLogEntityTypes.organizationalUnit,
    entityId: input.entityId,
    actorUserId: input.actorUserId,
    requestId: input.requestId,
    organizationalUnitId: input.organizationalUnitId ?? null,
    metadata: input.metadata,
  });
}
