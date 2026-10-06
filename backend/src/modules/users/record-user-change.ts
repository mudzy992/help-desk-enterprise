import { appendAuditLog } from '../audit-log/append-audit-log';
import { auditLogActions, auditLogEntityTypes } from '../audit-log/audit-log.constants';
import type { AuditLogWriteClient } from '../audit-log/audit-log.types';
import type { JsonValue } from '../change-log/change-log.types';

export type UserChangeAction =
  | typeof auditLogActions.userCreated
  | typeof auditLogActions.userUpdated
  | typeof auditLogActions.userDeleted
  | typeof auditLogActions.userPasswordReset
  | typeof auditLogActions.userPasswordResetRejected
  | typeof auditLogActions.userDirectoryUnlinked;

export async function recordUserChange(
  transaction: AuditLogWriteClient,
  input: {
    readonly action: UserChangeAction;
    readonly entityId: string;
    readonly actorUserId: string | null;
    readonly requestId: string | null;
    readonly metadata: JsonValue;
    readonly organizationalUnitId?: string | null;
  },
): Promise<void> {
  await appendAuditLog(transaction, {
    action: input.action,
    entityType: auditLogEntityTypes.user,
    entityId: input.entityId,
    actorUserId: input.actorUserId,
    requestId: input.requestId,
    organizationalUnitId: input.organizationalUnitId ?? null,
    metadata: input.metadata,
  });
}
