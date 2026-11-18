import { loadPrincipalContext } from '../../common/principal-context/load-principal-context';
import { permissionKeys } from '../authorization/authorization.constants';
import { ChangesService } from './changes.service';
import { changeErrorCodes } from './changes.constants';

jest.mock('../../common/principal-context/load-principal-context', () => ({ loadPrincipalContext: jest.fn() }));
jest.mock('../audit-log/record-audit-entry', () => ({ recordAuditEntry: jest.fn(async () => undefined) }));

const insidePath = '/inside';
const outsidePath = '/outside';

function principalOf(permissions: readonly string[], options: { unitPath?: string | null; roleKey?: string } = {}) {
  const unitPath = options.unitPath === undefined ? insidePath : options.unitPath;
  return {
    subjectId: 'user-1',
    isActive: true,
    homeOrganizationalUnitId: null,
    assignments: [{
      roleKey: options.roleKey ?? 'AGENT',
      permissionKeys: [...permissions],
      organizationalUnitId: unitPath === null ? null : 'ou-inside',
      organizationalUnitPath: unitPath,
      serviceId: null,
    }],
  };
}

const changeViewer = { userId: 'user-1', isSuperAdmin: false, homeOrganizationalUnitId: null, grants: [] };

const insideScope = {
  organizationalUnit: {
    OR: [{ ouPath: insidePath }, { ouPath: { startsWith: `${insidePath}/` } }],
  },
};

function configuration() {
  return {
    numberPrefix: 'CHG',
    normalQuorum: 1,
    emergencyQuorum: 1,
    minLeadTimeHours: 0,
    requireTestPlan: false,
    freezePeriods: [],
    reminderHoursBeforeStart: 24,
    timeZone: 'UTC',
  };
}

function listRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'change-1',
    sequence: 7,
    title: 'Swap the switch',
    type: 'NORMAL',
    status: 'DRAFT',
    risk: 'MEDIUM',
    plannedStart: null,
    plannedEnd: null,
    causesDowntime: false,
    ownerUserId: null,
    requesterUserId: 'user-1',
    cabGroupId: null,
    organizationalUnitId: 'ou-inside',
    createdAt: new Date('2030-01-01T00:00:00.000Z'),
    updatedAt: new Date('2030-01-01T00:00:00.000Z'),
    owner: null,
    requester: { id: 'user-1', displayName: 'Requestor', email: 'requestor@example.test' },
    cabGroup: null,
    organizationalUnit: { id: 'ou-inside', name: 'Inside', ouPath: insidePath },
    services: [],
    _count: { services: 0, assets: 0 },
    ...overrides,
  };
}

function detailRow(overrides: Record<string, unknown> = {}) {
  return {
    ...listRow(),
    description: 'Opis promjene',
    reason: 'Razlog',
    impact: 'MEDIUM',
    likelihood: 'MEDIUM',
    implementationPlan: null,
    backoutPlan: null,
    testPlan: null,
    communicationPlan: null,
    actualStart: null,
    actualEnd: null,
    outcome: null,
    reviewNotes: null,
    templateId: null,
    problemId: null,
    approvalRound: 1,
    conflictsAcknowledgedAt: null,
    submittedAt: null,
    authorizedAt: null,
    closedAt: null,
    cancelledAt: null,
    cancelReason: null,
    version: 1,
    template: null,
    problem: null,
    assets: [],
    ...overrides,
  };
}

function asset(id: string, ouPath: string) {
  return {
    id,
    assetTag: `TAG-${id}`,
    name: `Asset ${id}`,
    organizationalUnit: { ouPath },
  };
}

/** Query arguments of the stubbed calls; every assertion reads them from here. */
type QueryArgs = Record<string, unknown>;

function buildService() {
  const prisma = {
    asset: {
      findMany: jest.fn(async (_args: QueryArgs): Promise<unknown[]> => []),
      count: jest.fn(async (_args: QueryArgs): Promise<number> => 0),
    },
    organizationalUnit: { findUnique: jest.fn(async (_args: QueryArgs): Promise<unknown> => ({ ouPath: insidePath })) },
    changeRequest: {
      findMany: jest.fn(async (_args: QueryArgs): Promise<unknown[]> => []),
      findFirst: jest.fn(async (_args: QueryArgs): Promise<unknown> => null),
      count: jest.fn(async (_args: QueryArgs): Promise<number> => 0),
    },
    changeRequestAsset: { groupBy: jest.fn(async (_args: QueryArgs): Promise<unknown[]> => []) },
    group: {
      findFirst: jest.fn(async (_args: QueryArgs): Promise<unknown> => null),
      findUnique: jest.fn(async (_args: QueryArgs): Promise<unknown> => null),
    },
    user: {
      count: jest.fn(async (_args: QueryArgs): Promise<number> => 0),
      findMany: jest.fn(async (_args: QueryArgs): Promise<unknown[]> => []),
    },
    $transaction: jest.fn(async (_work: (tx: unknown) => unknown): Promise<unknown> => {
      throw new Error('transaction-reached');
    }),
  };
  const access = {
    require: jest.fn(async () => ({ all: true })),
    configuration: jest.fn(async () => configuration()),
    cmdbEnabled: jest.fn(async () => true),
    problemsEnabled: jest.fn(async () => false),
    hasPermission: jest.fn(() => false),
    scopeOf: jest.fn(async () => ({ all: true })),
    requireUnitInScope: jest.fn(async () => ({ id: 'ou-inside', ouPath: insidePath, name: 'Inside' })),
    problemNumberPrefix: jest.fn(async () => 'PRB'),
  };
  const service = new ChangesService(prisma as never, access as never, {} as never, {} as never);
  // The lifecycle rules are covered elsewhere; the detail projection needs
  // stable answers only.
  jest.spyOn(service as unknown as { canManage: () => Promise<boolean> }, 'canManage').mockResolvedValue(false);
  jest.spyOn(service as unknown as { editScopeFor: () => Promise<'none'> }, 'editScopeFor').mockResolvedValue('none');
  jest.spyOn(service as unknown as { allowedActions: () => Promise<never[]> }, 'allowedActions').mockResolvedValue([]);
  return { prisma, access, service };
}

function principalMock(value: unknown): void {
  (loadPrincipalContext as jest.Mock).mockResolvedValue(value);
}

describe('change asset linking (BA-changes-02)', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('link picker', () => {
    it('returns nothing without the asset.read grant, even with change.request', async () => {
      principalMock(principalOf([permissionKeys.changeRequest, permissionKeys.changeRead]));
      const { prisma, service } = buildService();

      await expect(service.searchAssets(changeViewer, 'switch')).resolves.toEqual({ items: [] });
      expect(prisma.asset.findMany).not.toHaveBeenCalled();
    });

    it('searches only inside the asset.read unit scope', async () => {
      principalMock(principalOf([permissionKeys.changeRequest, permissionKeys.assetRead]));
      const { prisma, service } = buildService();
      prisma.asset.findMany.mockResolvedValueOnce([{ id: 'asset-1', assetTag: 'TAG-1', name: 'Switch' }]);

      await expect(service.searchAssets(changeViewer, 'switch')).resolves.toEqual({
        items: [{ id: 'asset-1', assetTag: 'TAG-1', name: 'Switch' }],
      });
      const where = prisma.asset.findMany.mock.calls[0]?.[0]?.where as { AND: unknown[] };
      expect(where.AND[0]).toEqual(insideScope);
      expect(where.AND[1]).toEqual({
        OR: [
          { assetTag: { contains: 'switch', mode: 'insensitive' } },
          { name: { contains: 'switch', mode: 'insensitive' } },
          { serialNumber: { contains: 'switch', mode: 'insensitive' } },
        ],
      });
    });
  });

  describe('write link', () => {
    const input = {
      type: 'NORMAL' as const,
      title: 'Zamjena switcha',
      description: 'Planirana zamjena',
      organizationalUnitId: 'ou-inside',
      cabGroupId: 'cab-1',
      assetIds: ['asset-outside'],
    };

    it('reports a foreign or out-of-scope asset exactly like a missing one', async () => {
      principalMock(principalOf([permissionKeys.changeRequest, permissionKeys.changeRead, permissionKeys.assetRead]));
      const { prisma, service } = buildService();
      prisma.asset.count.mockResolvedValueOnce(0);

      await expect(service.create(changeViewer, { ...input })).rejects.toMatchObject({
        code: changeErrorCodes.assetNotFound,
      });
      const where = prisma.asset.count.mock.calls[0]?.[0]?.where as { AND: unknown[] };
      expect(where.AND[0]).toEqual(insideScope);
      expect(where.AND[1]).toEqual({ id: { in: ['asset-outside'] } });
    });

    it('fails closed for a viewer without asset.read', async () => {
      principalMock(principalOf([permissionKeys.changeRequest, permissionKeys.changeRead]));
      const { prisma, service } = buildService();
      prisma.asset.count.mockResolvedValueOnce(0);

      await expect(service.create(changeViewer, { ...input })).rejects.toMatchObject({
        code: changeErrorCodes.assetNotFound,
      });
      const where = prisma.asset.count.mock.calls[0]?.[0]?.where as { AND: unknown[] };
      expect(where.AND[0]).toEqual({ id: { in: [] } });
    });

    it('accepts an asset inside the scope', async () => {
      principalMock(principalOf([permissionKeys.changeRequest, permissionKeys.changeRead, permissionKeys.assetRead]));
      const { prisma, service } = buildService();
      prisma.asset.count.mockResolvedValueOnce(1);
      prisma.group.findUnique.mockResolvedValueOnce({ isCabGroup: true });

      // The sentinel proves the link check passed before the write transaction.
      await expect(service.create(changeViewer, { ...input })).rejects.toThrow('transaction-reached');
    });
  });

  describe('update keeps invisible links', () => {
    it('deletes only the links the editor can read', async () => {
      principalMock(principalOf([permissionKeys.changeRead, permissionKeys.changeRequest, permissionKeys.assetRead]));
      const { prisma, service } = buildService();
      const row = detailRow({
        version: 1,
        _count: { services: 0, assets: 2 },
        assets: [
          { asset: asset('asset-inside', insidePath) },
          { asset: asset('asset-outside', outsidePath) },
        ],
      });
      prisma.changeRequest.findFirst.mockResolvedValue(row);
      const deleteMany = jest.fn(async () => ({ count: 1 }));
      const createMany = jest.fn(async () => ({ count: 0 }));
      (prisma.$transaction as jest.Mock).mockImplementationOnce(async (work: (tx: unknown) => unknown) =>
        work({
          changeRequest: { updateMany: jest.fn(async () => ({ count: 1 })) },
          changeRequestService: { deleteMany: jest.fn(async () => ({ count: 0 })), createMany: jest.fn(async () => ({ count: 0 })) },
          changeRequestAsset: { deleteMany, createMany },
          changeEvent: { create: jest.fn(async () => undefined) },
        }),
      );
      jest.spyOn(service as unknown as { editScopeFor: () => Promise<'full'> }, 'editScopeFor').mockResolvedValue('full');

      await service.update(changeViewer, 'change-1', { version: 1, assetIds: [] });

      expect(deleteMany).toHaveBeenCalledTimes(1);
      expect(deleteMany).toHaveBeenCalledWith({ where: { changeId: 'change-1', assetId: { in: ['asset-inside'] } } });
      expect(createMany).not.toHaveBeenCalled();
    });
  });

  describe('read projection', () => {
    it('drops out-of-scope assets from the detail and counts only the visible ones', async () => {
      principalMock(principalOf([permissionKeys.changeRead, permissionKeys.assetRead]));
      const { prisma, service } = buildService();
      prisma.changeRequest.findFirst.mockResolvedValueOnce(
        detailRow({
          _count: { services: 0, assets: 2 },
          assets: [
            { asset: asset('asset-inside', `${insidePath}/network`) },
            { asset: asset('asset-outside', outsidePath) },
          ],
        }),
      );

      const detail = await service.get(changeViewer, 'change-1');

      expect(detail.assets).toEqual([{ id: 'asset-inside', assetTag: 'TAG-asset-inside', name: 'Asset asset-inside' }]);
      expect(detail.assetCount).toBe(1);
      expect(JSON.stringify(detail)).not.toContain('/outside');
    });

    it('hides every asset from a viewer without asset.read', async () => {
      principalMock(principalOf([permissionKeys.changeRead]));
      const { prisma, service } = buildService();
      prisma.changeRequest.findFirst.mockResolvedValueOnce(
        detailRow({
          _count: { services: 0, assets: 1 },
          assets: [{ asset: asset('asset-inside', insidePath) }],
        }),
      );

      const detail = await service.get(changeViewer, 'change-1');

      expect(detail.assets).toEqual([]);
      expect(detail.assetCount).toBe(0);
    });

    it('counts the visible links per list row inside the asset scope', async () => {
      principalMock(principalOf([permissionKeys.changeRead, permissionKeys.assetRead]));
      const { prisma, service } = buildService();
      prisma.changeRequest.findMany.mockResolvedValueOnce([
        listRow({ id: 'change-1', _count: { services: 0, assets: 3 } }),
        listRow({ id: 'change-2', _count: { services: 0, assets: 2 } }),
      ]);
      prisma.changeRequest.count.mockResolvedValueOnce(2);
      prisma.changeRequestAsset.groupBy.mockResolvedValueOnce([{ changeId: 'change-1', _count: { _all: 1 } }]);

      const page = await service.list(changeViewer, {});

      expect(page.items.map((item) => item.assetCount)).toEqual([1, 0]);
      expect(prisma.changeRequestAsset.groupBy).toHaveBeenCalledTimes(1);
      const groupWhere = prisma.changeRequestAsset.groupBy.mock.calls[0]?.[0]?.where as Record<string, unknown>;
      expect(groupWhere.asset).toEqual(insideScope);
      expect(groupWhere.changeId).toEqual({ in: ['change-1', 'change-2'] });
    });

    it('keeps the stored count for a viewer who sees every unit', async () => {
      principalMock(principalOf([permissionKeys.changeRead, permissionKeys.assetRead], { unitPath: null, roleKey: 'ADMIN' }));
      const { prisma, service } = buildService();
      prisma.changeRequest.findMany.mockResolvedValueOnce([listRow({ _count: { services: 0, assets: 3 } })]);
      prisma.changeRequest.count.mockResolvedValueOnce(1);

      const page = await service.list(changeViewer, {});

      expect(page.items[0]?.assetCount).toBe(3);
      expect(prisma.changeRequestAsset.groupBy).not.toHaveBeenCalled();
    });

    it('filters the reverse assetId query through the asset scope', async () => {
      principalMock(principalOf([permissionKeys.changeRead, permissionKeys.assetRead]));
      const { prisma, service } = buildService();
      prisma.changeRequest.findMany.mockResolvedValueOnce([]);
      prisma.changeRequest.count.mockResolvedValueOnce(0);

      await service.list(changeViewer, { assetId: 'asset-outside' });

      const where = prisma.changeRequest.findMany.mock.calls[0]?.[0]?.where as { AND: { assets?: unknown }[] };
      expect(where.AND).toContainEqual({ assets: { some: { assetId: 'asset-outside', asset: insideScope } } });
    });
  });
});
