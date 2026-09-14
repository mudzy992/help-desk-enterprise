import { PrismaService } from '../../common/prisma/prisma.service';
import { recordAuditEntry } from '../audit-log/record-audit-entry';
import {
  auditLogActions,
  auditLogEntityTypes,
} from '../audit-log/audit-log.constants';
import type { JsonValue } from '../change-log/change-log.types';

export async function recordSupportBundleAudit(
  prisma: PrismaService,
  input: {
    readonly actorUserId: string;
    readonly requestId: string;
    readonly parts: readonly string[];
  },
): Promise<void> {
  await recordAuditEntry(prisma, {
    action: auditLogActions.supportBundleExport,
    entityType: auditLogEntityTypes.supportBundle,
    entityId: input.requestId,
    metadata: {
      parts: [...input.parts],
    } as JsonValue,
    actorUserId: input.actorUserId,
    requestId: input.requestId,
  });
}
