import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../../generated/prisma/client';
import { permissionKeys } from '../authorization/authorization.constants';
import { settingKeys } from '../settings/setting-keys';
import { AssetAccessService } from './asset-access.service';
import { assetLimits, assetErrorCodes } from './assets.constants';
import { AssetsService } from './assets.service';
import type { AssetViewer } from './asset-viewer';
import {
  isAssetRelationCycleConflict,
  isAssetRelationExistsConflict,
} from './asset-relation-invariants';
import { wouldCreateRelationCycle } from './asset-relations';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase(
  'asset relation graph invariants (PostgreSQL concurrency acceptance, W7.6)',
  () => {
    jest.setTimeout(120_000);
    let prisma: PrismaClient;
    let assets: AssetsService;
    let viewer: AssetViewer;
    let unitId: string;
    let typeId: string;
    let actorId: string;
    let stamp: string;
    let assetSequence = 0;

    beforeAll(async () => {
      prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
      const settings = {
        getSetting: async (key: string) =>
          key === settingKeys.privateAddonsCmdb ? true : undefined,
      };
      const access = new AssetAccessService(prisma as never, settings as never);
      assets = new AssetsService(prisma as never, access, {
        assertDirectMoveAllowed: async () => undefined,
      } as never);

      stamp = `${Date.now()}${Math.floor(Math.random() * 10_000)}`;
      const [unit, actor, type] = await Promise.all([
        prisma.organizationalUnit.create({
          data: {
            name: `W7.6 relation unit ${stamp}`,
            type: 'DIRECTORATE',
            distinguishedName: `OU=W76Relations${stamp}`,
            ouPath: `/w76-relations-${stamp}`,
          },
          select: { id: true },
        }),
        prisma.user.create({
          data: {
            email: `w76-relation-actor-${stamp}@example.invalid`,
            displayName: 'W7.6 relation acceptance',
          },
          select: { id: true },
        }),
        prisma.assetType.create({
          data: {
            key: `w76-relations-${stamp}`,
            nameBs: `W7.6 relacije ${stamp}`,
            nameEn: `W7.6 relations ${stamp}`,
          },
          select: { id: true },
        }),
      ]);
      unitId = unit.id;
      actorId = actor.id;
      typeId = type.id;
      viewer = {
        userId: actorId,
        isSuperAdmin: false,
        homeOrganizationalUnitId: unitId,
        grants: [
          { permission: permissionKeys.assetManage, global: true, unitPath: null },
          { permission: permissionKeys.assetRead, global: true, unitPath: null },
        ],
      };
    });

    afterAll(async () => {
      if (prisma) {
        if (typeId) {
          const assets = await prisma.asset.findMany({ where: { typeId }, select: { id: true } });
          const assetIds = assets.map((asset) => asset.id);
          if (assetIds.length > 0) {
            await prisma.assetRelation.deleteMany({ where: { OR: [{ fromAssetId: { in: assetIds } }, { toAssetId: { in: assetIds } }] } });
            await prisma.assetEvent.deleteMany({ where: { assetId: { in: assetIds } } });
            await prisma.asset.deleteMany({ where: { id: { in: assetIds } } });
          }
          await prisma.assetType.deleteMany({ where: { id: typeId } });
        }
        if (actorId) await prisma.user.deleteMany({ where: { id: actorId } });
        if (unitId) await prisma.organizationalUnit.deleteMany({ where: { id: unitId } });
        await prisma.$disconnect();
      }
    });

    async function createAssets(count: number): Promise<string[]> {
      const rows = await Promise.all(
        Array.from({ length: count }, async () => {
          assetSequence += 1;
          const sequence = assetSequence;
          const asset = await prisma.asset.create({
            data: {
              assetTag: `W76-REL-${stamp}-${sequence}`,
              typeId,
              name: `W7.6 relation asset ${sequence}`,
              organizationalUnitId: unitId,
            },
            select: { id: true },
          });
          return asset.id;
        }),
      );
      return rows;
    }

    async function transactionsFromSameBarrier<T>(
      tasks: readonly ((transaction: Prisma.TransactionClient) => Promise<T>)[],
    ): Promise<PromiseSettledResult<T>[]> {
      let arrivals = 0;
      let release!: () => void;
      const barrier = new Promise<void>((resolve) => {
        release = resolve;
      });
      return Promise.allSettled(
        tasks.map((task) =>
          prisma.$transaction(async (transaction) => {
            await transaction.$queryRaw`SELECT pg_backend_pid()`;
            arrivals += 1;
            if (arrivals === tasks.length) release();
            await barrier;
            return task(transaction);
          }),
        ),
      );
    }

    function assertOneWinner<T>(outcomes: readonly PromiseSettledResult<T>[]) {
      const winners = outcomes.filter(
        (outcome): outcome is PromiseFulfilledResult<T> => outcome.status === 'fulfilled',
      );
      const losers = outcomes.filter(
        (outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected',
      );
      expect(winners).toHaveLength(1);
      expect(losers).toHaveLength(outcomes.length - 1);
      return losers.map((outcome) => outcome.reason as unknown);
    }

    async function countEdges(assetIds: readonly string[]) {
      return prisma.assetRelation.count({
        where: { fromAssetId: { in: [...assetIds] }, toAssetId: { in: [...assetIds] } },
      });
    }

    it('serializes simultaneous opposite directed writes; exactly one edge survives', async () => {
      const [first, second] = await createAssets(2);
      const outcomes = await transactionsFromSameBarrier([
        (transaction) =>
          transaction.assetRelation.create({
            data: { fromAssetId: first!, toAssetId: second!, kind: 'DEPENDS_ON' },
          }),
        (transaction) =>
          transaction.assetRelation.create({
            data: { fromAssetId: second!, toAssetId: first!, kind: 'DEPENDS_ON' },
          }),
      ]);
      const failures = assertOneWinner(outcomes);

      expect(isAssetRelationCycleConflict(failures[0])).toBe(true);
      const edges = await prisma.assetRelation.findMany({
        where: { fromAssetId: { in: [first!, second!] }, toAssetId: { in: [first!, second!] } },
        select: { fromAssetId: true, toAssetId: true, kind: true },
      });
      expect(edges).toHaveLength(1);
      expect(edges[0]?.kind).toBe('DEPENDS_ON');
    });

    it('serializes a concurrent three-writer cycle and rejects the edge that closes it', async () => {
      const [first, second, third] = await createAssets(3);
      const outcomes = await transactionsFromSameBarrier([
        (transaction) =>
          transaction.assetRelation.create({
            data: { fromAssetId: first!, toAssetId: second!, kind: 'RUNS_ON' },
          }),
        (transaction) =>
          transaction.assetRelation.create({
            data: { fromAssetId: second!, toAssetId: third!, kind: 'RUNS_ON' },
          }),
        (transaction) =>
          transaction.assetRelation.create({
            data: { fromAssetId: third!, toAssetId: first!, kind: 'RUNS_ON' },
          }),
      ]);
      const winners = outcomes.filter((outcome) => outcome.status === 'fulfilled');
      const failures = outcomes.filter(
        (outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected',
      );
      expect(winners).toHaveLength(2);
      expect(failures).toHaveLength(1);
      expect(isAssetRelationCycleConflict(failures[0]?.reason)).toBe(true);
      expect(await countEdges([first!, second!, third!])).toBe(2);
    });

    it('enforces CONNECTED_TO uniqueness on unordered endpoints under a direct PostgreSQL race', async () => {
      const [first, second] = await createAssets(2);
      const outcomes = await transactionsFromSameBarrier([
        (transaction) =>
          transaction.assetRelation.create({
            data: { fromAssetId: first!, toAssetId: second!, kind: 'CONNECTED_TO' },
          }),
        (transaction) =>
          transaction.assetRelation.create({
            data: { fromAssetId: second!, toAssetId: first!, kind: 'CONNECTED_TO' },
          }),
      ]);
      const failures = assertOneWinner(outcomes);

      expect(isAssetRelationExistsConflict(failures[0])).toBe(true);
      expect(await countEdges([first!, second!])).toBe(1);
    });

    it('rejects and rolls back a multi-row directed cycle in one statement', async () => {
      const [first, second, third] = await createAssets(3);
      let failure: unknown;
      try {
        await prisma.assetRelation.createMany({
          data: [
            { fromAssetId: first!, toAssetId: second!, kind: 'PART_OF' },
            { fromAssetId: second!, toAssetId: third!, kind: 'PART_OF' },
            { fromAssetId: third!, toAssetId: first!, kind: 'PART_OF' },
          ],
        });
      } catch (error) {
        failure = error;
      }

      expect(isAssetRelationCycleConflict(failure)).toBe(true);
      expect(await countEdges([first!, second!, third!])).toBe(0);
    });

    it('maps a database-only long-path cycle rejection back to the existing API error', async () => {
      const ids = await createAssets(assetLimits.relationDepthMax + 3);
      const chain = ids.slice(0, -1).map((fromAssetId, index) => ({
        fromAssetId,
        toAssetId: ids[index + 1]!,
        kind: 'INSTALLED_ON' as const,
      }));
      await prisma.assetRelation.createMany({ data: chain });

      const fromAssetId = ids.at(-1)!;
      const toAssetId = ids[0]!;
      const precheck = await wouldCreateRelationCycle(
        fromAssetId,
        toAssetId,
        async (assetIds, direction) =>
          prisma.assetRelation.findMany({
            where:
              direction === 'out'
                ? { fromAssetId: { in: [...assetIds] } }
                : { toAssetId: { in: [...assetIds] } },
            select: { fromAssetId: true, toAssetId: true, kind: true },
          }),
      );
      expect(precheck).toBe(false);

      await expect(
        assets.addRelation(fromAssetId, { toAssetId, kind: 'INSTALLED_ON' }, viewer),
      ).rejects.toMatchObject({ code: assetErrorCodes.relationCycle });
      expect(await countEdges(ids)).toBe(chain.length);
    });

    it('keeps the API duplicate error for an already stored reverse CONNECTED_TO edge', async () => {
      const [first, second] = await createAssets(2);
      await assets.addRelation(first!, { toAssetId: second!, kind: 'CONNECTED_TO' }, viewer);
      await expect(
        assets.addRelation(second!, { toAssetId: first!, kind: 'CONNECTED_TO' }, viewer),
      ).rejects.toMatchObject({ code: assetErrorCodes.relationExists });
    });
  },
);
