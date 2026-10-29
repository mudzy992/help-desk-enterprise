import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { appendAuditLog } from './append-audit-log';
import { auditLogActions, auditLogEntityTypes } from './audit-log.constants';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase('audit OU scope provenance (integration)', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient;
  const marker = `audit-scope-${Date.now()}`;

  beforeAll(() => { prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) }); });
  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { entityId: marker } });
    await prisma.organizationalUnit.deleteMany({ where: { id: marker } });
    await prisma.$disconnect();
  });

  it('rejects a producer OU that differs from the canonical entity scope', async () => {
    await prisma.organizationalUnit.create({
      data: { id: marker, name: marker, type: 'OFFICE', distinguishedName: `OU=${marker}`, ouPath: `/${marker}` },
    });
    await expect(prisma.$transaction((transaction) => appendAuditLog(transaction as never, {
      action: auditLogActions.organizationalUnitUpdated,
      entityType: auditLogEntityTypes.organizationalUnit,
      entityId: marker,
      metadata: { after: { name: marker }, source: 'scope-proof' },
      actorUserId: null,
      organizationalUnitId: `${marker}-forged`,
    }))).rejects.toThrow(/AUDIT_SCOPE_PROVENANCE_MISMATCH/u);
    expect(await prisma.auditLog.count({ where: { entityId: marker } })).toBe(0);

    await prisma.$transaction((transaction) => appendAuditLog(transaction as never, {
      action: auditLogActions.organizationalUnitUpdated,
      entityType: auditLogEntityTypes.organizationalUnit,
      entityId: marker,
      metadata: { after: { name: marker }, source: 'scope-proof' },
      actorUserId: null,
      organizationalUnitId: marker,
    }));
    expect(await prisma.auditLog.findFirst({ where: { entityId: marker }, select: { organizationalUnitId: true } })).toEqual({ organizationalUnitId: marker });
  });

  it('requires explicitly global actions to remain scope-less', async () => {
    await expect(appendAuditLog(prisma as never, {
      action: auditLogActions.authLoginFailed,
      entityType: auditLogEntityTypes.authEvent,
      entityId: 'anonymous',
      metadata: { provider: 'local', reason: 'invalid_credentials' },
      actorUserId: null,
      organizationalUnitId: marker,
    })).rejects.toThrow('AUDIT_SCOPE_MUST_BE_GLOBAL');
  });
});
