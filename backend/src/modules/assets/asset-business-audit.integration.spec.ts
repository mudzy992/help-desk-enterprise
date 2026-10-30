import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { auditLogActions, auditLogEntityTypes } from '../audit-log/audit-log.constants';
import { AssetCatalogService } from './asset-catalog.service';
import type { AssetViewer } from './asset-viewer';
import { withAssetAuditTransaction } from './asset-audit-transaction';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase('asset business write and global audit transaction (W7.12)', () => {
  jest.setTimeout(60_000);
  let prisma: PrismaClient;
  let catalog: AssetCatalogService;
  const token = randomUUID().replaceAll('-', '').slice(0, 18);
  const createdCodes = [`w712-${token}-ok`, `w712-${token}-rb`];
  const viewer: AssetViewer = {
    userId: 'w712-audit-actor',
    isSuperAdmin: false,
    homeOrganizationalUnitId: null,
    grants: [],
  };

  beforeAll(() => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    const access = { require: jest.fn().mockResolvedValue({ all: true }) };
    catalog = new AssetCatalogService(prisma as never, access as never);
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.assetLocation.deleteMany({ where: { code: { in: createdCodes } } });
    await prisma.$disconnect();
  });

  it('persists a catalog location and its versioned audit entry together', async () => {
    const result = await catalog.createLocation({ name: `W7.12 audit ${token}`, code: createdCodes[0], sortOrder: 0 }, viewer);
    const location = await prisma.assetLocation.findUnique({ where: { id: result.id }, select: { id: true, code: true } });
    const entry = await prisma.auditLog.findFirst({
      where: { action: auditLogActions.assetLocationSaved, entityType: auditLogEntityTypes.assetLocation, entityId: result.id },
      select: { actionSchemaVersion: true, metadata: true, actorUserId: true },
    });

    expect(location).toEqual({ id: result.id, code: createdCodes[0] });
    expect(entry).toMatchObject({ actionSchemaVersion: 2, metadata: { created: true }, actorUserId: viewer.userId });
  });

  it('rolls back the business write if its transactional audit event is rejected', async () => {
    let attemptedId: string | null = null;
    await expect(withAssetAuditTransaction(
      prisma,
      async (transaction) => {
        const row = await transaction.assetLocation.create({
          data: { name: `W7.12 rollback ${token}`, code: createdCodes[1], sortOrder: 0 },
          select: { id: true },
        });
        attemptedId = row.id;
        return row;
      },
      (row) => ({
        action: auditLogActions.assetLocationSaved,
        entityType: auditLogEntityTypes.assetLocation,
        entityId: row.id,
        metadata: { notAllowedForThisSchema: true },
        actorUserId: viewer.userId,
      }),
    )).rejects.toThrow('AUDIT_METADATA_FIELD_NOT_ALLOWED');

    expect(attemptedId).not.toBeNull();
    expect(await prisma.assetLocation.findUnique({ where: { code: createdCodes[1] } })).toBeNull();
    expect(await prisma.auditLog.count({ where: { entityId: attemptedId ?? '' } })).toBe(0);
  });
});
