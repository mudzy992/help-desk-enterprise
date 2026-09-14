import { appendAuditLog } from './append-audit-log';
import type {
  AuditLogTransactionalClient,
  RecordAuditEntryInput,
} from './audit-log.types';

export async function recordAuditEntry(
  prisma: AuditLogTransactionalClient,
  input: RecordAuditEntryInput,
): Promise<void> {
  if (typeof prisma.$transaction === 'function') {
    await prisma.$transaction(async (transaction) => {
      await appendAuditLog(transaction, input);
    });
    return;
  }
  await appendAuditLog(prisma, input);
}
