jest.mock('../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));

import type { PrismaService } from '../../common/prisma/prisma.service';
import { announcementLimits } from './announcements.constants';
import type { AnnouncementViewer } from './announcement-viewer';
import { AnnouncementsService } from './announcements.service';

const now = new Date('2026-10-29T12:00:00.000Z');

function viewer(overrides: Partial<AnnouncementViewer> = {}): AnnouncementViewer {
  return {
    userId: 'user-1',
    roleKeys: ['AGENT', 'ADMIN'],
    groupIds: ['group-1', 'group-2'],
    homeOrganizationalUnitId: 'ou-home',
    authorizationPrincipal: null,
    manageScope: { global: false, organizationalUnits: [] },
    reportScope: { global: false, organizationalUnits: [] },
    canManageAll: false,
    canReadReports: false,
    isAgent: false,
    ...overrides,
  };
}

function setup(input: { readonly homeUnitPath?: string | null } = {}) {
  const homeUnitPath = input.homeUnitPath === undefined ? '/Korisnici/Direkcija/IKT' : input.homeUnitPath;
  const prisma = {
    announcement: { findMany: jest.fn(async (_query: Record<string, unknown>) => []) },
    organizationalUnit: {
      findUnique: jest.fn(async () => (homeUnitPath === null ? null : { ouPath: homeUnitPath })),
      findMany: jest.fn(async () => [
        { id: 'ou-root' },
        { id: 'ou-directorate' },
        { id: 'ou-it' },
      ]),
    },
    announcementAcknowledgement: { findMany: jest.fn(async () => []) },
    service: { findMany: jest.fn(async () => []) },
  };
  const settings = { getSetting: jest.fn(async () => true) };
  const service = new AnnouncementsService(prisma as unknown as PrismaService, settings as never, {} as never);
  return { service, prisma };
}

describe('AnnouncementsService viewer visibility caps', () => {
  it('pushes role, home-OU ancestry and group audience matching into the active query before its ranked cap', async () => {
    const { service, prisma } = setup();

    await service.active(viewer(), now);

    expect(prisma.organizationalUnit.findMany).toHaveBeenCalledWith({
      where: { ouPath: { in: ['/Korisnici', '/Korisnici/Direkcija', '/Korisnici/Direkcija/IKT'] } },
      select: { id: true },
    });
    const query = prisma.announcement.findMany.mock.calls[0]?.[0];
    expect(query).toEqual(expect.objectContaining({
      where: expect.objectContaining({
        AND: [
          {
            OR: [
              { audienceRoles: { isEmpty: true } },
              { audienceRoles: { hasSome: ['AGENT', 'ADMIN'] } },
            ],
          },
          {
            OR: [
              { audienceOrganizationalUnitIds: { isEmpty: true } },
              { audienceOrganizationalUnitIds: { hasSome: ['ou-root', 'ou-directorate', 'ou-it'] } },
            ],
          },
          {
            OR: [
              { audienceGroupIds: { isEmpty: true } },
              { audienceGroupIds: { hasSome: ['group-1', 'group-2'] } },
            ],
          },
        ],
      }),
      orderBy: [{ severity: 'desc' }, { startsAt: 'desc' }, { id: 'asc' }],
      take: announcementLimits.activeMax,
    }));
  });

  it('applies the same audience predicate before the archive cap', async () => {
    const { service, prisma } = setup();

    await service.archive(viewer(), now);

    expect(prisma.announcement.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: 'PUBLISHED',
        AND: expect.arrayContaining([
          { OR: [{ audienceRoles: { isEmpty: true } }, { audienceRoles: { hasSome: ['AGENT', 'ADMIN'] } }] },
          {
            OR: [
              { audienceOrganizationalUnitIds: { isEmpty: true } },
              { audienceOrganizationalUnitIds: { hasSome: ['ou-root', 'ou-directorate', 'ou-it'] } },
            ],
          },
          { OR: [{ audienceGroupIds: { isEmpty: true } }, { audienceGroupIds: { hasSome: ['group-1', 'group-2'] } }] },
        ]),
      }),
      orderBy: [{ startsAt: 'desc' }, { id: 'asc' }],
      take: announcementLimits.archiveMax,
    }));
  });

  it('fails closed for every non-empty filter when viewer scope data is absent', async () => {
    const { service, prisma } = setup({ homeUnitPath: null });

    await service.active(viewer({ roleKeys: [], groupIds: [], homeOrganizationalUnitId: null }), now);

    const query = prisma.announcement.findMany.mock.calls[0]?.[0];
    expect(query?.where).toEqual(expect.objectContaining({
      AND: [
        { OR: [{ audienceRoles: { isEmpty: true } }] },
        { OR: [{ audienceOrganizationalUnitIds: { isEmpty: true } }] },
        { OR: [{ audienceGroupIds: { isEmpty: true } }] },
      ],
    }));
    expect(prisma.organizationalUnit.findMany).not.toHaveBeenCalled();
  });
});
