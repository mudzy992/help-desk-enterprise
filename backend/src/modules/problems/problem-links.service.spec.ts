import { ProblemLinksService } from './problem-links.service';
import { ProblemError, problemErrorCodes } from './problems.constants';
import { problemTicketVisibility } from './problem-ticket-visibility';
import { problemAssetAccess } from './problem-asset-access';

jest.mock('../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));
jest.mock('../authorization/authorization-context.loader', () => ({ AuthorizationContextLoader: class AuthorizationContextLoader {} }));
jest.mock('../tickets/ticket-access-policy-binder', () => ({ TicketAccessPolicyBinder: class TicketAccessPolicyBinder {} }));
jest.mock('./problem-access.service', () => ({ ProblemAccessService: class ProblemAccessService {} }));
jest.mock('./problem-ticket-visibility', () => ({ problemTicketVisibility: jest.fn(async () => ({ id: { in: ['visible'] } })) }));
jest.mock('./problem-asset-access', () => ({
  ...jest.requireActual('./problem-asset-access'),
  problemAssetAccess: jest.fn(),
}));

const viewer = { userId: 'u1', isSuperAdmin: false, grants: [], homeOrganizationalUnitId: null } as never;

function setup(options: { status?: string; authority?: boolean; cmdb?: boolean; statusPage?: boolean; canRead?: boolean } = {}) {
  const problem = { id: 'p1', status: options.status ?? 'INVESTIGATING', groupId: 'g1', serviceId: 's-main' };
  const prisma = {
    problem: { findFirst: jest.fn(async () => problem), findMany: jest.fn(async () => [{ id: 'p1', sequence: 7, title: 'VPN', status: 'NEW', priority: 'HIGH' }]) },
    problemService: { findMany: jest.fn(async () => []), create: jest.fn(async () => ({})) },
    problemAsset: {
      findMany: jest.fn(async () => []),
      create: jest.fn(async () => ({})),
      deleteMany: jest.fn(async () => ({ count: 1 })),
    },
    problemIncident: { findMany: jest.fn(async () => []) },
    ticketAsset: { groupBy: jest.fn(async (_args: unknown): Promise<unknown[]> => []) },
    asset: {
      findMany: jest.fn(async (): Promise<unknown[]> => []),
      findFirst: jest.fn(async (): Promise<unknown> => ({ assetTag: 'PC-0042', name: 'Laptop' })),
      count: jest.fn(async () => 1),
    },
    $transaction: jest.fn(async (callback: (client: unknown) => Promise<unknown>) => callback({
      problemAsset: { create: jest.fn(async () => ({})), deleteMany: jest.fn(async () => ({ count: 1 })) },
      problemService: { create: jest.fn(async () => ({})), deleteMany: jest.fn(async () => ({ count: 1 })) },
      problemIncident: { create: jest.fn(async () => ({})), deleteMany: jest.fn(async () => ({ count: 1 })) },
      problemEvent: { create: jest.fn(async () => ({})) },
    })),
    service: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => ({ id: where.id, name: 'Mail' })),
      findFirst: jest.fn(async () => ({ id: 's2', name: 'Mail' })),
    },
    serviceIncident: { findFirst: jest.fn(async () => ({ id: 'i1', title: 'VPN prekid' })), count: jest.fn(async () => 1) },
    problemEvent: { create: jest.fn(async () => ({})) },
  };
  const access = {
    require: jest.fn(async () => ({ all: true })),
    cmdbEnabled: jest.fn(async () => options.cmdb ?? true),
    statusPageEnabled: jest.fn(async () => options.statusPage ?? true),
    hasGroupAuthority: jest.fn(async () => options.authority ?? true),
    requireGroupAuthority: jest.fn(async () => {
      if (options.authority === false) throw new ProblemError(problemErrorCodes.forbidden, 'problem_group');
    }),
    capabilities: jest.fn(async () => ({ enabled: true, canRead: options.canRead ?? true, configuration: { numberPrefix: 'P-' } })),
  };
  const loader = { loadBySubjectId: jest.fn(async () => null) };
  return { service: new ProblemLinksService(prisma as never, access as never, loader as never, {} as never), prisma, access, loader };
}

const scopedWhere = { organizationalUnit: { OR: [{ ouPath: '/inside' }, { ouPath: { startsWith: '/inside/' } }] } };
const assetRow = {
  id: 'a1', assetTag: 'PC-0042', name: 'Laptop', status: 'IN_USE',
  type: { nameBs: 'Laptop', nameEn: 'Laptop' }, organizationalUnit: { name: 'Sektor' },
};

describe('ProblemLinksService (P5b)', () => {
  beforeEach(() => {
    (problemAssetAccess as jest.Mock).mockReset();
    (problemAssetAccess as jest.Mock).mockResolvedValue({ allowed: true, where: null });
  });
  it('filters ticket-derived suggestions before grouping and limiting', async () => {
    const { service, prisma } = setup();
    await service.get('p1', viewer);
    expect(prisma.ticketAsset.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ ticket: { is: { AND: [{ id: { in: ['visible'] } }, { problemLink: { is: { problemId: 'p1' } } }] } } }),
      take: 20,
    }));
  });

  it('fails closed if ticket visibility cannot be established', async () => {
    const { service, prisma } = setup();
    (problemTicketVisibility as jest.Mock).mockRejectedValueOnce(new Error('unavailable'));
    await expect(service.get('p1', viewer)).rejects.toThrow('unavailable');
    expect(prisma.ticketAsset.groupBy).not.toHaveBeenCalled();
  });
  it('leaves CMDB items and incidents out while their modules are off', async () => {
    const { service, prisma } = setup({ cmdb: false, statusPage: false });
    const links = await service.get('p1', viewer);
    expect(links).toMatchObject({ cmdbEnabled: false, statusEnabled: false, assets: [], suggestedAssets: [], incidents: [] });
    expect(prisma.problemAsset.findMany).not.toHaveBeenCalled();
    expect(prisma.problemIncident.findMany).not.toHaveBeenCalled();
  });

  it('needs authority in the problem group and an open problem to edit', async () => {
    await expect(setup({ authority: false }).service.linkService('p1', viewer, 's2')).rejects.toMatchObject({ code: problemErrorCodes.forbidden });
    await expect(setup({ status: 'CLOSED' }).service.linkService('p1', viewer, 's2')).rejects.toMatchObject({ code: problemErrorCodes.finalStatus });
    expect(await setup({ status: 'CLOSED' }).service.get('p1', viewer)).toMatchObject({ canEdit: false });
  });

  it('does not add the main service again and records extra services in the history', async () => {
    const main = setup();
    expect(await main.service.linkService('p1', viewer, 's-main')).toEqual({ linked: 0 });
    expect(main.prisma.problemService.create).not.toHaveBeenCalled();
    const extra = setup();
    expect(await extra.service.linkService('p1', viewer, 's2')).toEqual({ linked: 1 });
    // The link and its history line are one transaction (W7.29).
    expect(extra.prisma.$transaction).toHaveBeenCalled();
    expect(extra.prisma.problemEvent.create).not.toHaveBeenCalled();
  });

  it('refuses CMDB links while the CMDB module is off', async () => {
    await expect(setup({ cmdb: false }).service.linkAssets('p1', viewer, ['a1'])).rejects.toMatchObject({ code: problemErrorCodes.assetNotFound });
  });

  it('answers the asset card with numbered problems, or nothing without problem.read', async () => {
    expect(await setup().service.forAsset('a1', viewer)).toEqual({ items: [{ id: 'p1', number: 'P-000007', title: 'VPN', status: 'NEW', priority: 'HIGH' }] });
    expect(await setup({ canRead: false }).service.forAsset('a1', viewer)).toEqual({ items: [] });
  });

  it('filters linked assets and suggestions by the CMDB scope of the viewer', async () => {
    const { service, prisma } = setup();
    (problemAssetAccess as jest.Mock).mockResolvedValue({ allowed: true, where: scopedWhere });
    prisma.ticketAsset.groupBy.mockResolvedValueOnce([{ assetId: 'a1', _count: { _all: 2 } }]);
    prisma.asset.findMany.mockResolvedValueOnce([assetRow]);
    const links = await service.get('p1', viewer);
    expect(prisma.problemAsset.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { problemId: 'p1', asset: { is: scopedWhere } },
    }));
    expect(prisma.asset.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { AND: [scopedWhere, { id: { in: ['a1'] } }] },
    }));
    expect(links.suggestedAssets).toEqual([{
      id: 'a1', assetTag: 'PC-0042', name: 'Laptop', status: 'IN_USE',
      typeNameBs: 'Laptop', typeNameEn: 'Laptop', organizationalUnitName: 'Sektor', ticketCount: 2,
    }]);
  });

  it('hides all linked assets and suggestions when the viewer has no asset.read', async () => {
    const { service, prisma } = setup();
    (problemAssetAccess as jest.Mock).mockResolvedValue({ allowed: false, where: null });
    const links = await service.get('p1', viewer);
    expect(prisma.problemAsset.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { problemId: 'p1', asset: { is: { id: { in: [] } } } },
    }));
    expect(prisma.ticketAsset.groupBy).toHaveBeenCalled();
    expect(links.suggestedAssets).toEqual([]);
    expect(links.assets).toEqual([]);
  });

  it('constrains the asset picker and answers nothing without the asset.read scope', async () => {
    const scoped = setup();
    (problemAssetAccess as jest.Mock).mockResolvedValue({ allowed: true, where: scopedWhere });
    scoped.prisma.asset.findMany.mockResolvedValueOnce([assetRow]);
    const result = await scoped.service.searchAssets('p1', viewer, 'PC');
    expect(scoped.prisma.asset.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ AND: [scopedWhere], problems: { none: { problemId: 'p1' } } }),
    }));
    expect(result.items).toHaveLength(1);

    const denied = setup();
    (problemAssetAccess as jest.Mock).mockResolvedValue({ allowed: false, where: null });
    expect(await denied.service.searchAssets('p1', viewer, 'PC')).toEqual({ items: [] });
    expect(denied.prisma.asset.findMany).not.toHaveBeenCalled();
  });

  it('refuses to link or unlink an asset outside the CMDB scope', async () => {
    const denied = setup();
    (problemAssetAccess as jest.Mock).mockResolvedValue({ allowed: false, where: null });
    await expect(denied.service.linkAssets('p1', viewer, ['a1'])).rejects.toMatchObject({ code: problemErrorCodes.assetNotFound });
    await expect(denied.service.unlinkAsset('p1', viewer, 'a1')).rejects.toMatchObject({ code: problemErrorCodes.assetNotFound });
    expect(denied.prisma.problemAsset.deleteMany).not.toHaveBeenCalled();

    const foreign = setup();
    (problemAssetAccess as jest.Mock).mockResolvedValue({ allowed: true, where: scopedWhere });
    foreign.prisma.asset.findMany.mockResolvedValueOnce([]);
    await expect(foreign.service.linkAssets('p1', viewer, ['a1'])).rejects.toMatchObject({ code: problemErrorCodes.assetNotFound });
    expect(foreign.prisma.$transaction).not.toHaveBeenCalled();

    const unlink = setup();
    (problemAssetAccess as jest.Mock).mockResolvedValue({ allowed: true, where: scopedWhere });
    unlink.prisma.asset.findFirst.mockResolvedValueOnce(null);
    await expect(unlink.service.unlinkAsset('p1', viewer, 'a1')).rejects.toMatchObject({ code: problemErrorCodes.assetNotFound });
    expect(unlink.prisma.problemAsset.deleteMany).not.toHaveBeenCalled();
  });

  it('links an in-scope asset transactionally with its history event', async () => {
    const { service, prisma } = setup();
    (problemAssetAccess as jest.Mock).mockResolvedValue({ allowed: true, where: scopedWhere });
    prisma.asset.findMany.mockResolvedValueOnce([{ id: 'a1', assetTag: 'PC-0042', name: 'Laptop' }]);
    expect(await service.linkAssets('p1', viewer, ['a1'])).toEqual({ linked: 1 });
    expect(prisma.asset.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { AND: [scopedWhere, { id: { in: ['a1'] } }] },
    }));
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('keeps the asset card empty for an unreadable asset', async () => {
    const foreign = setup();
    (problemAssetAccess as jest.Mock).mockResolvedValue({ allowed: true, where: scopedWhere });
    foreign.prisma.asset.count.mockResolvedValueOnce(0);
    expect(await foreign.service.forAsset('a1', viewer)).toEqual({ items: [] });
    expect(foreign.prisma.problem.findMany).not.toHaveBeenCalled();

    const readable = setup();
    (problemAssetAccess as jest.Mock).mockResolvedValue({ allowed: true, where: scopedWhere });
    readable.prisma.asset.count.mockResolvedValueOnce(1);
    expect((await readable.service.forAsset('a1', viewer)).items).toHaveLength(1);
  });
});
