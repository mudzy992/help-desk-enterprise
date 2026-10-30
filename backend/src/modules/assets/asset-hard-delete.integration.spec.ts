import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { permissionKeys } from '../authorization/authorization.constants';
import { settingKeys } from '../settings/setting-keys';
import { AssetAccessService } from './asset-access.service';
import { AssetsService } from './assets.service';
import { assetErrorCodes } from './assets.constants';
import type { AssetViewer } from './asset-viewer';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase(
  'asset hard-delete dependency and event-history contract (PostgreSQL, W7.15)',
  () => {
    jest.setTimeout(120_000);
    let prisma: PrismaClient;
    let assets: AssetsService;
    let unitId: string;
    let typeId: string;
    let actorId: string;
    let stamp: string;
    let sequence = 0;
    const assetIds = new Set<string>();

    const superAdmin = (): AssetViewer => ({
      userId: actorId,
      isSuperAdmin: true,
      homeOrganizationalUnitId: null,
      grants: [],
    });

    beforeAll(async () => {
      prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: url! }),
      });
      const settings = {
        getSetting: async (key: string) =>
          key === settingKeys.privateAddonsCmdb ? true : undefined,
      };
      const access = new AssetAccessService(prisma as never, settings as never);
      assets = new AssetsService(prisma as never, access, {
        assertDirectMoveAllowed: async () => undefined,
      } as never);

      stamp = randomUUID().replaceAll('-', '').slice(0, 16);
      const unit = await prisma.organizationalUnit.create({
        data: {
          name: `W7.15 hard-delete unit ${stamp}`,
          type: 'DIRECTORATE',
          distinguishedName: `OU=W715HardDelete${stamp}`,
          ouPath: `/w715-hard-delete-${stamp}`,
        },
        select: { id: true },
      });
      unitId = unit.id;
      const type = await prisma.assetType.create({
        data: {
          key: `w715-hard-delete-${stamp}`,
          nameBs: `Brisanje ${stamp}`,
          nameEn: `Hard delete ${stamp}`,
        },
        select: { id: true },
      });
      typeId = type.id;
      const actor = await prisma.user.create({
        data: {
          email: `w715-hard-delete-${stamp}@example.invalid`,
          displayName: 'W7.15 hard-delete actor',
        },
        select: { id: true },
      });
      actorId = actor.id;
    });

    afterEach(async () => {
      const ids = [...assetIds];
      if (ids.length > 0) {
        await prisma.assetRelation.deleteMany({
          where: {
            OR: [{ fromAssetId: { in: ids } }, { toAssetId: { in: ids } }],
          },
        });
        await prisma.assetEventArchive.deleteMany({
          where: { originalAssetId: { in: ids } },
        });
        await prisma.assetEvent.deleteMany({ where: { assetId: { in: ids } } });
        await prisma.asset.deleteMany({ where: { id: { in: ids } } });
        assetIds.clear();
      }
    });

    afterAll(async () => {
      if (!prisma) return;
      await prisma.asset.deleteMany({ where: { typeId } });
      await prisma.assetType.deleteMany({ where: { id: typeId } });
      await prisma.user.deleteMany({ where: { id: actorId } });
      await prisma.organizationalUnit.deleteMany({ where: { id: unitId } });
      await prisma.$disconnect();
    });

    async function createAsset(): Promise<{ id: string; assetTag: string }> {
      sequence += 1;
      const assetTag = `W715-${stamp}-${sequence}`;
      const asset = await prisma.asset.create({
        data: {
          assetTag,
          name: `W7.15 hard-delete asset ${sequence}`,
          typeId,
          organizationalUnitId: unitId,
        },
        select: { id: true, assetTag: true },
      });
      assetIds.add(asset.id);
      return asset;
    }

    it('retains detached history, including a final delete event, and exposes it only to SUPER_ADMIN', async () => {
      const asset = await createAsset();
      const created = await prisma.assetEvent.create({
        data: {
          assetId: asset.id,
          action: 'created',
          actorUserId: actorId,
          detail: { assetTag: asset.assetTag },
        },
        select: { id: true, assetId: true },
      });

      expect(created).toEqual({ id: expect.any(String), assetId: asset.id });
      await assets.remove(asset.id, superAdmin());

      expect(
        await prisma.asset.findUnique({ where: { id: asset.id } }),
      ).toBeNull();
      expect(
        await prisma.assetEvent.count({ where: { assetId: asset.id } }),
      ).toBe(0);
      const retained = await prisma.assetEventArchive.findMany({
        where: { originalAssetId: asset.id },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          originalAssetId: true,
          assetTagSnapshot: true,
          action: true,
          actorUserId: true,
          detail: true,
          createdAt: true,
        },
      });
      expect(retained).toHaveLength(2);
      expect(retained).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: created.id,
            originalAssetId: asset.id,
            assetTagSnapshot: asset.assetTag,
            action: 'created',
            actorUserId: actorId,
            detail: { assetTag: asset.assetTag },
          }),
          expect.objectContaining({
            originalAssetId: asset.id,
            assetTagSnapshot: asset.assetTag,
            action: 'deleted',
            actorUserId: actorId,
            detail: { assetTag: asset.assetTag },
          }),
        ]),
      );

      const history = await assets.history(asset.id, superAdmin());
      expect(history.items).toHaveLength(2);
      expect(
        history.items.every(
          (item) =>
            item.assetId === asset.id &&
            item.assetTag === asset.assetTag &&
            item.retainedAfterAssetDelete,
        ),
      ).toBe(true);
      expect(history.items.map((item) => item.action)).toContain('deleted');
      await expect(
        assets.history(asset.id, {
          userId: actorId,
          isSuperAdmin: false,
          homeOrganizationalUnitId: unitId,
          grants: [
            {
              permission: permissionKeys.assetRead,
              global: true,
              unitPath: null,
            },
          ],
        }),
      ).rejects.toMatchObject({ code: assetErrorCodes.notFound });

      expect(
        await prisma.auditLog.findFirst({
          where: {
            action: 'asset.deleted',
            entityType: 'asset',
            entityId: asset.id,
          },
          select: { entityId: true, metadata: true, actorUserId: true },
        }),
      ).toMatchObject({
        entityId: asset.id,
        metadata: { assetTag: asset.assetTag },
        actorUserId: actorId,
      });
    });

    it('returns the stable dependency conflict and does not cascade or erase relation history', async () => {
      const asset = await createAsset();
      const related = await createAsset();
      const relation = await prisma.assetRelation.create({
        data: {
          fromAssetId: asset.id,
          toAssetId: related.id,
          kind: 'CONNECTED_TO',
          createdByUserId: actorId,
        },
        select: { id: true },
      });
      await prisma.assetEvent.create({
        data: {
          assetId: asset.id,
          action: 'created',
          detail: { assetTag: asset.assetTag },
        },
      });

      await expect(assets.remove(asset.id, superAdmin())).rejects.toMatchObject(
        {
          code: assetErrorCodes.hasDependents,
          detail: 'relationsFrom:1',
        },
      );
      await expect(
        prisma.asset.delete({ where: { id: asset.id } }),
      ).rejects.toThrow();
      expect(
        await prisma.asset.findUnique({ where: { id: asset.id } }),
      ).not.toBeNull();
      expect(
        await prisma.assetRelation.findUnique({ where: { id: relation.id } }),
      ).not.toBeNull();
      expect(
        await prisma.assetEvent.count({ where: { assetId: asset.id } }),
      ).toBe(1);
      expect(
        await prisma.assetEventArchive.count({
          where: { originalAssetId: asset.id },
        }),
      ).toBe(0);
    });
  },
);
