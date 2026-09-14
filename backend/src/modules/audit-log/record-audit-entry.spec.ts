import { auditLogGenesisHash } from './audit-log.constants';
import { createInMemoryAuditLogDelegate } from './create-in-memory-audit-log-delegate';
import { recordAuditEntry } from './record-audit-entry';
import { verifyAuditLogChain } from './verify-audit-log-chain';
import type { AuditLogRecord } from './audit-log.types';

describe('recordAuditEntry', () => {
  it('chains hashes so a later metadata rewrite is detected', async () => {
    const rows: Parameters<typeof createInMemoryAuditLogDelegate>[0] = [];
    const prisma = {
      ...createInMemoryAuditLogDelegate(
        rows,
        (() => {
          let next = 1;
          return () => `audit-${next++}`;
        })(),
        () => new Date('2026-09-14T12:00:00.000Z'),
      ),
      $transaction: async (
        callback: (client: ReturnType<typeof createInMemoryAuditLogDelegate>) => Promise<void>,
      ) => callback(prisma),
    };
    await recordAuditEntry(prisma, {
      action: 'policy_pack.apply',
      entityType: 'policy_pack',
      entityId: 'PACK_IT_STANDARD',
      metadata: { createdRolePermissionCount: 1 },
      actorUserId: 'admin-1',
      organizationalUnitId: 'ou-it',
    });
    await recordAuditEntry(prisma, {
      action: 'audit.export',
      entityType: 'audit_log',
      entityId: 'ou-it',
      metadata: { format: 'json', recordCount: 1 },
      actorUserId: 'admin-1',
      organizationalUnitId: 'ou-it',
    });
    expect(rows[0]?.previousHash).toBe(auditLogGenesisHash);
    expect(rows[1]?.previousHash).toBe(rows[0]?.hash);
    const records = rows as unknown as AuditLogRecord[];
    expect(
      verifyAuditLogChain({ records, hashAlgorithm: 'sha256' }).valid,
    ).toBe(true);
    rows[1] = { ...rows[1]!, metadata: { format: 'csv', recordCount: 99 } };
    expect(
      verifyAuditLogChain({
        records: rows as unknown as AuditLogRecord[],
        hashAlgorithm: 'sha256',
      }),
    ).toMatchObject({ valid: false, firstMismatchIndex: 1 });
  });
});
