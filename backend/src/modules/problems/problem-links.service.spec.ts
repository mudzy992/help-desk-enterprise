import { ProblemLinksService } from './problem-links.service';
import { ProblemError, problemErrorCodes } from './problems.constants';

const viewer = { userId: 'u1', isSuperAdmin: false, grants: [], homeOrganizationalUnitId: null } as never;

function setup(options: { status?: string; authority?: boolean; cmdb?: boolean; statusPage?: boolean; canRead?: boolean } = {}) {
  const problem = { id: 'p1', status: options.status ?? 'INVESTIGATING', groupId: 'g1', serviceId: 's-main' };
  const prisma = {
    problem: { findFirst: jest.fn(async () => problem), findMany: jest.fn(async () => [{ id: 'p1', sequence: 7, title: 'VPN', status: 'NEW', priority: 'HIGH' }]) },
    problemService: { findMany: jest.fn(async () => []), create: jest.fn(async () => ({})) },
    problemAsset: { findMany: jest.fn(async () => []) },
    problemIncident: { findMany: jest.fn(async () => []) },
    ticketAsset: { groupBy: jest.fn(async () => []) },
    asset: { findMany: jest.fn(async () => []) },
    service: { findUnique: jest.fn(async ({ where }: { where: { id: string } }) => ({ id: where.id, name: 'Mail' })) },
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
  return { service: new ProblemLinksService(prisma as never, access as never), prisma, access };
}

describe('ProblemLinksService (P5b)', () => {
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
    expect(extra.prisma.problemEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'service_linked' }) }));
  });

  it('refuses CMDB links while the CMDB module is off', async () => {
    await expect(setup({ cmdb: false }).service.linkAssets('p1', viewer, ['a1'])).rejects.toMatchObject({ code: problemErrorCodes.assetNotFound });
  });

  it('answers the asset card with numbered problems, or nothing without problem.read', async () => {
    expect(await setup().service.forAsset('a1', viewer)).toEqual({ items: [{ id: 'p1', number: 'P-000007', title: 'VPN', status: 'NEW', priority: 'HIGH' }] });
    expect(await setup({ canRead: false }).service.forAsset('a1', viewer)).toEqual({ items: [] });
  });
});
