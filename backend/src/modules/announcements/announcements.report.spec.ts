jest.mock('../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));

import type { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthorizationService } from '../authorization/authorization.service';
import type { AnnouncementViewer } from './announcement-viewer';
import { AnnouncementsService } from './announcements.service';

const row = {
  id: 'ann-1',
  title: 'Report consistency',
  body: 'Body',
  severity: 'INFO' as const,
  displayMode: 'BANNER' as const,
  requiresAcknowledgement: true,
  notifyAudience: false,
  startsAt: new Date('2026-10-29T00:00:00.000Z'),
  endsAt: new Date('2026-11-05T00:00:00.000Z'),
  audienceRoles: ['USER'],
  audienceOrganizationalUnitIds: [],
  audienceGroupIds: [],
  serviceId: null,
  status: 'PUBLISHED' as const,
  version: 1,
  createdById: 'actor-1',
  publishedAt: new Date('2026-10-29T00:00:00.000Z'),
  withdrawnAt: null,
  audienceSizeAtPublish: 10,
  anonymizedAcknowledgements: 1,
  audienceNotifiedAt: null,
  lastReminderAt: null,
  sendEmail: false,
  postToTeams: false,
  teamsPostedAt: null,
  teamsResult: null,
  createdAt: new Date('2026-10-29T00:00:00.000Z'),
  updatedAt: new Date('2026-10-29T00:00:00.000Z'),
};

const viewer = {
  userId: 'actor-1',
  roleKeys: ['ADMIN'],
  groupIds: [],
  homeOrganizationalUnitId: null,
  authorizationPrincipal: {
    subjectId: 'actor-1',
    email: 'actor@example.invalid',
    displayName: 'Report reader',
    isLocalOnly: false,
  },
  manageScope: { global: true, organizationalUnits: [] },
  reportScope: { global: true, organizationalUnits: [] },
  canManageAll: true,
  canReadReports: true,
  isAgent: false,
} as unknown as AnnouncementViewer;

function setup() {
  const prisma = {
    announcement: {
      findUnique: jest.fn(async () => row),
    },
    user: {
      // Current audience: 8 users (unit ou-1: 5, no unit: 3).
      // Of those, 5 acknowledged (ou-1: 4, no unit: 1). The acknowledged groupBy
      // is the second call and carries the acknowledgement relation filter.
      groupBy: jest.fn(async (query: { readonly where: unknown }) => {
        const where = JSON.stringify(query.where);
        return where.includes('announcementAcknowledgements')
          ? [
              { organizationalUnitId: 'ou-1', _count: { _all: 4 } },
              { organizationalUnitId: null, _count: { _all: 1 } },
            ]
          : [
              { organizationalUnitId: 'ou-1', _count: { _all: 5 } },
              { organizationalUnitId: null, _count: { _all: 3 } },
            ];
      }),
      count: jest.fn(async () => 3),
      findMany: jest.fn(async () => []),
    },
    announcementAcknowledgement: {
      // 7 live acknowledgement rows: 5 from the current audience, 2 from users
      // who have since left it. Plus 1 anonymized receipt on the row.
      count: jest.fn(async () => 7),
    },
    announcementEmailRun: { findMany: jest.fn(async () => []) },
    organizationalUnit: {
      findMany: jest.fn(async () => [{ id: 'ou-1', name: 'IT' }]),
    },
  };
  const service = new AnnouncementsService(
    prisma as unknown as PrismaService,
    { getSetting: jest.fn(async () => true) } as never,
    {
      authorizeResource: jest.fn(async () => ({ allowed: true, reason: 'GLOBAL_ASSIGNMENT_ALLOWED' as const })),
    } as unknown as AuthorizationService,
  );
  return { service };
}

describe('BA-announcements-12 report population consistency', () => {
  it('never mixes publish, current and historical acknowledgement populations', async () => {
    const { service } = setup();
    const report = await service.report('ann-1', viewer);
    expect(report.audienceSizeAtPublish).toBe(10);
    expect(report.currentAudienceSize).toBe(8);
    expect(report.acknowledgedInCurrentAudience).toBe(5);
    expect(report.pendingCount).toBe(3);
    // The headline partition is exact: acknowledged-in-current + pending = current.
    expect(report.acknowledgedInCurrentAudience + report.pendingCount).toBe(report.currentAudienceSize);
    // Historical total keeps former members and the anonymized receipt, apart.
    expect(report.acknowledgedCount).toBe(8);
    expect(report.acknowledgedOutsideCurrentAudience).toBe(3);
    expect(report.byUnit).toEqual([
      { unit: '', audience: 3, acknowledged: 1 },
      { unit: 'IT', audience: 5, acknowledged: 4 },
    ]);
  });
});
