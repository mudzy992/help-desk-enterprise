import { ConflictException } from '@nestjs/common';
import { AssetsService } from './assets.service';
import {
  AssetError,
  assetErrorCodes,
  assetEventActions,
} from './assets.constants';
import type { AssetViewer } from './asset-viewer';
import { mapAssetError } from './map-asset-error';

const dependencyKinds = [
  'tickets',
  'relationsFrom',
  'relationsTo',
  'transferItems',
  'contractItems',
  'licenseAssignments',
  'problems',
  'changes',
] as const;

type DependencyKind = (typeof dependencyKinds)[number];
type DependencyCounts = Record<DependencyKind, number>;

const noDependencies: DependencyCounts = {
  tickets: 0,
  relationsFrom: 0,
  relationsTo: 0,
  transferItems: 0,
  contractItems: 0,
  licenseAssignments: 0,
  problems: 0,
  changes: 0,
};

const viewer: AssetViewer = {
  userId: 'super-admin-1',
  isSuperAdmin: true,
  homeOrganizationalUnitId: null,
  grants: [],
};

function harness(counts: DependencyCounts = noDependencies) {
  const transaction = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'asset-1' }]),
    $executeRaw: jest.fn().mockResolvedValue(1),
    asset: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'asset-1',
        assetTag: 'HD-001',
        _count: counts,
      }),
      delete: jest.fn().mockResolvedValue({ id: 'asset-1' }),
    },
    assetEvent: { create: jest.fn().mockResolvedValue({ id: 'event-1' }) },
    auditLog: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
    },
  };
  const prisma = {
    $transaction: jest.fn(
      async (operation: (tx: typeof transaction) => Promise<unknown>) =>
        operation(transaction),
    ),
  };
  const access = { requireEnabled: jest.fn().mockResolvedValue(undefined) };
  const assets = new AssetsService(
    prisma as never,
    access as never,
    {} as never,
  );
  return { assets, prisma, transaction, access };
}

describe('asset hard delete and event-history retention (W7.15)', () => {
  it.each(dependencyKinds)(
    'blocks hard-delete when %s business references exist',
    async (kind) => {
      const counts = { ...noDependencies, [kind]: 2 };
      const { assets, transaction } = harness(counts);

      await expect(assets.remove('asset-1', viewer)).rejects.toMatchObject({
        code: assetErrorCodes.hasDependents,
        detail: `${kind}:2`,
      });

      expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);
      expect(transaction.asset.findUnique).toHaveBeenCalledTimes(1);
      expect(transaction.asset.delete).not.toHaveBeenCalled();
      expect(transaction.assetEvent.create).not.toHaveBeenCalled();
      expect(transaction.auditLog.create).not.toHaveBeenCalled();
      expect(transaction.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        transaction.asset.findUnique.mock.invocationCallOrder[0] ??
          Number.POSITIVE_INFINITY,
      );
    },
  );

  it('writes a final detached-history event and the global audit in the locked transaction', async () => {
    const { assets, transaction } = harness();

    await assets.remove('asset-1', viewer);

    expect(transaction.assetEvent.create).toHaveBeenCalledWith({
      data: {
        assetId: 'asset-1',
        action: assetEventActions.deleted,
        actorUserId: viewer.userId,
        detail: { assetTag: 'HD-001' },
      },
    });
    expect(transaction.asset.delete).toHaveBeenCalledWith({
      where: { id: 'asset-1' },
    });
    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'asset.deleted',
        entityId: 'asset-1',
        metadata: { assetTag: 'HD-001' },
      }),
    });
    expect(
      transaction.assetEvent.create.mock.invocationCallOrder[0],
    ).toBeLessThan(
      transaction.asset.delete.mock.invocationCallOrder[0] ??
        Number.POSITIVE_INFINITY,
    );
    expect(transaction.asset.delete.mock.invocationCallOrder[0]).toBeLessThan(
      transaction.auditLog.create.mock.invocationCallOrder[0] ??
        Number.POSITIVE_INFINITY,
    );
  });

  it('requires the module and global SUPER_ADMIN before opening the transaction', async () => {
    const { assets, prisma, access } = harness();
    await expect(
      assets.remove('asset-1', { ...viewer, isSuperAdmin: false }),
    ).rejects.toMatchObject({
      code: assetErrorCodes.forbidden,
    });
    expect(access.requireEnabled).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('maps the stable dependency conflict to HTTP 409 and preserves its safe count detail', () => {
    const mapped = mapAssetError(
      new AssetError(assetErrorCodes.hasDependents, 'transferItems:1'),
    );

    expect(mapped).toBeInstanceOf(ConflictException);
    expect((mapped as ConflictException).getStatus()).toBe(409);
    expect((mapped as ConflictException).getResponse()).toMatchObject({
      code: assetErrorCodes.hasDependents,
      detail: 'transferItems:1',
    });
  });
});
