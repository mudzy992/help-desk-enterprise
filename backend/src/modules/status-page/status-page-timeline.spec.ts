import { StatusPageService, type StatusViewer } from './status-page.service';

const viewer: StatusViewer = { userId: 'staff-1', isStaff: true, canManage: false, staffScope: { global: true, serviceIds: [], organizationalUnitPaths: [] } };

describe('StatusPageService bounded timeline', () => {
  it('loads take + 1 with a keyset cursor and returns a bounded page', async () => {
    const rows = Array.from({ length: 4 }, (_, index) => ({
      id: `update-${index + 1}`,
      status: 'INVESTIGATING',
      message: `message-${index + 1}`,
      createdAt: new Date(`2026-01-0${index + 1}T00:00:00.000Z`),
      authorUserId: 'author-1',
    }));
    const prisma = {
      serviceIncident: { findFirst: jest.fn().mockResolvedValue({ id: 'incident-1' }) },
      serviceIncidentUpdate: { findMany: jest.fn().mockResolvedValue(rows) },
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'author-1', displayName: 'Author' }]) },
    };
    const service = new StatusPageService(prisma as never, {} as never, {} as never, {} as never, {} as never);

    const result = await service.timeline('incident-1', viewer, { take: 3, cursor: 'update-before' });

    expect(prisma.serviceIncidentUpdate.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { incidentId: 'incident-1' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 4,
      cursor: { id: 'update-before' },
      skip: 1,
    }));
    expect(result).toMatchObject({ hasMore: true, nextCursor: 'update-3' });
    expect(result.items).toHaveLength(3);
    expect(result.items[0]).toMatchObject({ id: 'update-1', authorName: 'Author' });
  });

  it('fails closed before loading timeline rows when the incident is not visible', async () => {
    const prisma = {
      serviceIncident: { findFirst: jest.fn().mockResolvedValue(null) },
      serviceIncidentUpdate: { findMany: jest.fn() },
    };
    const service = new StatusPageService(prisma as never, {} as never, {} as never, {} as never, {} as never);
    await expect(service.timeline('incident-foreign', viewer, { take: 20 })).rejects.toMatchObject({ status: 404 });
    expect(prisma.serviceIncidentUpdate.findMany).not.toHaveBeenCalled();
  });
});
