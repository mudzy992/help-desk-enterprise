import { permissionKeys } from '../authorization/authorization.constants';
import { ChangesService } from './changes.service';

type QueryArgs = Record<string, unknown>;

const viewer = { userId: 'user-1', isSuperAdmin: false, homeOrganizationalUnitId: null, grants: [] };
const scope = { all: true as const };

function eventRow(id: string, createdAt: string) {
  return {
    id,
    action: 'updated',
    actorUserId: 'user-1',
    detail: { operation: 'updated' },
    createdAt: new Date(createdAt),
  };
}

function buildService(rows: readonly unknown[]) {
  const prisma = {
    changeEvent: { findMany: jest.fn(async (_args: QueryArgs): Promise<readonly unknown[]> => rows) },
    user: { findMany: jest.fn(async (_args: QueryArgs): Promise<readonly unknown[]> => [{ id: 'user-1', displayName: 'Ana', email: 'ana@example.test' }]) },
  };
  const access = { require: jest.fn(async () => scope) };
  const service = new ChangesService(prisma as never, access as never, {} as never, {} as never);
  jest
    .spyOn(service as unknown as { loadInScope: () => Promise<unknown> }, 'loadInScope')
    .mockResolvedValue({ id: 'change-1' });
  jest
    .spyOn(service as unknown as { detailLevelFor: () => Promise<string> }, 'detailLevelFor')
    .mockResolvedValue('full');
  return { prisma, access, service };
}

describe('change timeline paging (BA-changes-18)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('asks for one row past the page and returns the cursor of the last event shown', async () => {
    const rows = Array.from({ length: 51 }, (_, index) =>
      eventRow(`evt-${String(index).padStart(2, '0')}`, `2030-01-01T00:${String(index).padStart(2, '0')}:00.000Z`),
    );
    const { prisma, service } = buildService(rows);

    const page = await service.events(viewer, 'change-1');

    expect(prisma.changeEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 51, where: { changeId: 'change-1' } }),
    );
    expect(page.items).toHaveLength(50);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toBe('evt-49');
    // No cursor on the first page: Prisma must not be given `skip` yet.
    expect((prisma.changeEvent.findMany.mock.calls[0][0] as QueryArgs).cursor).toBeUndefined();
  });

  it('passes the cursor back to the database and stops advertising more on the last page', async () => {
    const { prisma, service } = buildService([eventRow('evt-51', '2030-01-01T00:51:00.000Z')]);

    const page = await service.events(viewer, 'change-1', { limit: 50, cursor: 'evt-50' });

    expect(prisma.changeEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: { id: 'evt-50' }, skip: 1 }),
    );
    expect(page.items.map((event) => event.id)).toEqual(['evt-51']);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });

  it('clamps an oversized limit instead of letting the caller read the whole change', async () => {
    const { prisma, service } = buildService([]);

    await service.events(viewer, 'change-1', { limit: 5000 });

    expect((prisma.changeEvent.findMany.mock.calls[0][0] as QueryArgs).take).toBe(201);
  });

  it('is still guarded by the change read permission', async () => {
    const { access, service } = buildService([]);
    access.require.mockRejectedValueOnce(new Error('CHANGE_FORBIDDEN'));

    await expect(service.events(viewer, 'change-1')).rejects.toThrow('CHANGE_FORBIDDEN');
    expect(access.require).toHaveBeenCalledWith(viewer, permissionKeys.changeRead);
  });
});
