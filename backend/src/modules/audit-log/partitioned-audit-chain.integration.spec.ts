import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { appendAuditLog } from './append-audit-log';
import { auditLogActions, auditLogEntityTypes } from './audit-log.constants';
import { verifyAuditLogChain } from './verify-audit-log-chain';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase('partitioned audit append concurrency (integration)', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient;
  const marker = `partition-${Date.now()}`;

  beforeAll(() => { prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) }); });
  afterAll(async () => { await prisma.auditLog.deleteMany({ where: { entityId: { startsWith: marker } } }); await prisma.$disconnect(); });

  it('commits unrelated OU partitions concurrently without forks', async () => {
    let appended!: () => void;
    const appendedPromise = new Promise<void>((resolve) => { appended = resolve; });
    let release!: () => void;
    const releasePromise = new Promise<void>((resolve) => { release = resolve; });

    const first = prisma.$transaction(async (transaction) => {
      await appendAuditLog(transaction as never, {
        action: auditLogActions.privacyRetentionRun,
        entityType: auditLogEntityTypes.retentionRun,
        entityId: `${marker}-a`, metadata: {}, actorUserId: null,
        organizationalUnitId: `${marker}-ou-a`,
      });
      appended();
      await releasePromise;
    }, { timeout: 10_000 });

    await appendedPromise;
    const second = prisma.$transaction((transaction) => appendAuditLog(transaction as never, {
      action: auditLogActions.privacyRetentionRun,
      entityType: auditLogEntityTypes.retentionRun,
      entityId: `${marker}-b`, metadata: {}, actorUserId: null,
      organizationalUnitId: `${marker}-ou-b`,
    }), { timeout: 10_000 });

    await expect(Promise.race([
      second.then(() => 'committed'),
      new Promise((resolve) => setTimeout(() => resolve('blocked'), 2_000)),
    ])).resolves.toBe('committed');
    release();
    await first;

    const rows = await prisma.auditLog.findMany({ where: { entityId: { startsWith: marker } } });
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.chainPartition))).toEqual(new Set([`ou:${marker}-ou-a`, `ou:${marker}-ou-b`]));
    expect(rows.every((row) => row.previousHash === '0'.repeat(64))).toBe(true);
    expect(verifyAuditLogChain({ records: rows as never, hashAlgorithm: 'sha256' }).valid).toBe(true);
  });
});
