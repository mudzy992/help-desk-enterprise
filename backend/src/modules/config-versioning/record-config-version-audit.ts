import { appendAuditLog } from '../audit-log/append-audit-log';
import { auditLogEntityTypes } from '../audit-log/audit-log.constants';
import type { AuditLogWriteClient } from '../audit-log/audit-log.types';
import type { JsonValue } from '../change-log/change-log.types';

export async function recordConfigVersionAudit(
  transaction: AuditLogWriteClient,
  input: {
    readonly action: string;
    readonly entityId: string;
    readonly actorUserId: string | null;
    readonly metadata: JsonValue;
  },
): Promise<void> {
  await appendAuditLog(transaction, {
    action: input.action,
    entityType: auditLogEntityTypes.configVersion,
    entityId: input.entityId,
    metadata: input.metadata,
    actorUserId: input.actorUserId,
  });
}
