import { permissionKeys } from '../authorization/authorization.constants';
import { ChangeTemplatesService } from './change-templates.service';

type QueryArgs = Record<string, unknown>;

const viewer = { userId: 'user-1', isSuperAdmin: false, homeOrganizationalUnitId: null, grants: [] };

function templateRow(id: string) {
  return {
    id,
    name: `Šablon ${id}`,
    description: '',
    implementationPlan: 'plan',
    backoutPlan: 'backout',
    testPlan: null,
    impact: 'LOW' as const,
    likelihood: 'LOW' as const,
    causesDowntime: false,
    isActive: true,
    createdAt: new Date('2030-01-01T00:00:00.000Z'),
    updatedAt: new Date('2030-01-01T00:00:00.000Z'),
    services: [],
    _count: { changes: 0 },
  };
}

function buildService(rows: readonly unknown[]) {
  const prisma = {
    changeTemplate: { findMany: jest.fn(async (_args: QueryArgs): Promise<readonly unknown[]> => rows) },
  };
  const access = {
    require: jest.fn(async () => ({ all: true })),
    hasPermission: jest.fn(() => true),
  };
  return { prisma, access, service: new ChangeTemplatesService(prisma as never, access as never) };
}

describe('template catalogue paging (BA-changes-18)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('pages the catalogue instead of stopping at a hard 500', async () => {
    const rows = Array.from({ length: 51 }, (_, index) => templateRow(`tpl-${String(index).padStart(2, '0')}`));
    const { prisma, service } = buildService(rows);

    const page = await service.list(viewer, false);

    const args = prisma.changeTemplate.findMany.mock.calls[0][0] as QueryArgs;
    expect(args.take).toBe(51);
    // `id` closes the ordering, so a page boundary cannot repeat a row.
    expect(args.orderBy).toEqual([{ isActive: 'desc' }, { name: 'asc' }, { id: 'asc' }]);
    expect(page.items).toHaveLength(50);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toBe('tpl-49');
  });

  it('forwards the cursor and ends the list honestly', async () => {
    const { prisma, service } = buildService([templateRow('tpl-51')]);

    const page = await service.list(viewer, true, { limit: 50, cursor: 'tpl-50' });

    expect(prisma.changeTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: { id: 'tpl-50' }, skip: 1, where: {} }),
    );
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });

  it('keeps inactive rows behind change.manage even while paging', async () => {
    const { access, service } = buildService([]);
    access.hasPermission.mockReturnValue(false);

    await service.list(viewer, true);

    expect(access.require).toHaveBeenCalledWith(viewer, permissionKeys.changeRead);
    expect(access.hasPermission).toHaveBeenCalledWith(viewer, permissionKeys.changeManage);
  });

  it('a full page with nothing behind it is the end, not a promise of more', async () => {
    const rows = Array.from({ length: 50 }, (_, index) => templateRow(`tpl-${String(index).padStart(2, '0')}`));
    const { service } = buildService(rows);

    const page = await service.list(viewer, false, { limit: 50 });

    expect(page.items).toHaveLength(50);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });
});
