import { appendAuditLog } from '../audit-log/append-audit-log';
import { auditLogActions, auditLogEntityTypes } from '../audit-log/audit-log.constants';
import type { AuditLogWriteClient } from '../audit-log/audit-log.types';
import type { JsonValue } from '../change-log/change-log.types';

export type GroupChangeAction =
  | typeof auditLogActions.groupCreated
  | typeof auditLogActions.groupUpdated
  | typeof auditLogActions.groupDeleted
  | typeof auditLogActions.groupMemberAdded
  | typeof auditLogActions.groupMemberRemoved;

export async function recordGroupChange(
  transaction: AuditLogWriteClient,
  input: {
    readonly action: GroupChangeAction;
    readonly entityId: string;
    readonly actorUserId: string | null;
    readonly requestId: string | null;
    readonly metadata: JsonValue;
    readonly organizationalUnitId?: string | null;
  },
): Promise<void> {
  await appendAuditLog(transaction, {
    action: input.action,
    entityType: auditLogEntityTypes.group,
    entityId: input.entityId,
    actorUserId: input.actorUserId,
    requestId: input.requestId,
    organizationalUnitId: input.organizationalUnitId ?? null,
    metadata: input.metadata,
  });
}
