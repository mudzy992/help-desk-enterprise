jest.mock('../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));
jest.mock('../audit-log/record-audit-entry', () => ({ recordAuditEntry: jest.fn() }));
jest.mock('../audit-log/append-audit-log', () => ({ appendAuditLog: jest.fn(async () => undefined) }));

import type { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthorizationService } from '../authorization/authorization.service';
import type { AnnouncementViewer } from './announcement-viewer';
import { AnnouncementsService } from './announcements.service';

const now = new Date('2026-10-29T12:00:00.000Z');

const draftRow = {
  id: 'ann-1',
  title: 'Snapshot me',
  body: 'Body',
  severity: 'INFO' as const,
  displayMode: 'BANNER' as const,
  requiresAcknowledgement: true,
  notifyAudience: false,
  startsAt: new Date('2026-11-05T00:00:00.000Z'),
  endsAt: new Date('2026-11-06T00:00:00.000Z'),
  audienceRoles: ['USER'],
  audienceOrganizationalUnitIds: [],
  audienceGroupIds: [],
  serviceId: null,
  status: 'DRAFT' as const,
  version: 3,
  createdById: 'actor-1',
  publishedAt: null,
  withdrawnAt: null,
  audienceSizeAtPublish: null,
  anonymizedAcknowledgements: 0,
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
    displayName: 'Publisher',
    isLocalOnly: false,
  },
  manageScope: { global: true, organizationalUnits: [] },
  reportScope: { global: true, organizationalUnits: [] },
  canManageAll: true,
  canReadReports: true,
  isAgent: false,
} as unknown as AnnouncementViewer;

const audienceUsers = [
  { id: 'user-1', organizationalUnitId: 'ou-1' },
  { id: 'user-2', organizationalUnitId: 'ou-1' },
  { id: 'user-3', organizationalUnitId: null },
];

function publishSetup() {
  const createdMembers: Array<{ announcementId: string; userId: string; organizationalUnitId: string | null }> = [];
  const announcementState = { ...draftRow };
  const client = {
    announcement: {
      findUnique: jest.fn(async () => announcementState),
      updateMany: jest.fn(async () => ({ count: 1 })),
      update: jest.fn(async (input: { data: { audienceSizeAtPublish: number } }) => {
        announcementState.audienceSizeAtPublish = input.data.audienceSizeAtPublish;
        return announcementState;
      }),
    },
    user: {
      findMany: jest.fn(async (query: { where?: { AND?: Array<{ id?: { gt?: string } }> } }) => {
        const gt = query.where?.AND?.find((term) => term.id?.gt)?.id?.gt;
        return audienceUsers.filter((user) => gt === undefined || user.id > gt);
      }),
      count: jest.fn(async () => audienceUsers.length),
    },
    announcementAudienceMember: {
      createMany: jest.fn(async (input: { data: typeof createdMembers }) => {
        createdMembers.push(...input.data);
        return { count: input.data.length };
      }),
    },
    announcementRevision: { findMany: jest.fn(async () => []) },
    organizationalUnit: { findMany: jest.fn(async () => []) },
  };
  const prisma = {
    ...client,
    $transaction: jest.fn(async (operation: (tx: unknown) => Promise<unknown>) => operation(client)),
  };
  const service = new AnnouncementsService(
    prisma as unknown as PrismaService,
    { getSetting: jest.fn(async () => true) } as never,
    {
      authorizeResource: jest.fn(async () => ({ allowed: true, reason: 'GLOBAL_ASSIGNMENT_ALLOWED' as const })),
    } as unknown as AuthorizationService,
  );
  return { service, createdMembers, announcementState };
}

function reportSetup() {
  const publishedRow = {
    ...draftRow,
    status: 'PUBLISHED' as const,
    publishedAt: now,
    audienceSizeAtPublish: 3,
    startsAt: new Date('2026-10-29T00:00:00.000Z'),
  };
  const members = [
    { userId: 'user-1', organizationalUnitId: 'ou-1' },
    { userId: 'user-2', organizationalUnitId: 'ou-1' },
    { userId: 'user-3', organizationalUnitId: null },
  ];
  const prisma = {
    announcement: { findUnique: jest.fn(async () => publishedRow) },
    user: {
      groupBy: jest.fn(async (query: { readonly where: unknown }) =>
        JSON.stringify(query.where).includes('announcementAcknowledgements')
          ? [{ organizationalUnitId: 'ou-1', _count: { _all: 1 } }]
          : [
              { organizationalUnitId: 'ou-1', _count: { _all: 1 } },
              { organizationalUnitId: 'ou-9', _count: { _all: 1 } },
            ],
      ),
      count: jest.fn(async () => 1),
      findMany: jest.fn(async (query: { where: { id: { in: string[] } } }) =>
        query.where.id.in.map((id) => ({ id, displayName: `Name ${id}` })),
      ),
    },
    announcementAcknowledgement: {
      // user-1 (in snapshot) and user-9 (joined later, acked too).
      count: jest.fn(async () => 2),
      findMany: jest.fn(async () => [{ userId: 'user-1' }, { userId: 'user-9' }]),
    },
    announcementAudienceMember: {
      count: jest.fn(async () => members.length),
      groupBy: jest.fn(async (query: { readonly where: { userId?: { in: string[] } } }) =>
        query.where.userId !== undefined
          ? [{ organizationalUnitId: 'ou-1', _count: { _all: 1 } }]
          : [
              { organizationalUnitId: 'ou-1', _count: { _all: 2 } },
              { organizationalUnitId: null, _count: { _all: 1 } },
            ],
      ),
      findMany: jest.fn(
        async (query: {
          select: { userId: true };
          where?: { userId?: { gt?: string } };
          orderBy?: { userId: 'asc' };
        }) => {
          if (query.orderBy?.userId === 'asc') return members;
          return members.map((member) => ({ userId: member.userId }));
        },
      ),
    },
    announcementEmailRun: { findMany: jest.fn(async () => []) },
    organizationalUnit: {
      findMany: jest.fn(async () => [
        { id: 'ou-1', name: 'IT' },
        { id: 'ou-9', name: 'Field' },
      ]),
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

describe('BA-announcements-13 publish membership snapshot', () => {
  it('writes every audience member and the matching size in the publish transaction', async () => {
    const { service, createdMembers, announcementState } = publishSetup();
    await service.publish('ann-1', viewer, 3, now);
    expect(createdMembers).toEqual([
      { announcementId: 'ann-1', userId: 'user-1', organizationalUnitId: 'ou-1' },
      { announcementId: 'ann-1', userId: 'user-2', organizationalUnitId: 'ou-1' },
      { announcementId: 'ann-1', userId: 'user-3', organizationalUnitId: null },
    ]);
    expect(announcementState.audienceSizeAtPublish).toBe(3);
  });

  it('reports against the snapshot, with later joiners outside the headline', async () => {
    const { service } = reportSetup();
    const report = await service.report('ann-1', viewer);
    expect(report.snapshotAvailable).toBe(true);
    expect(report.audienceSizeAtPublish).toBe(3);
    expect(report.acknowledgedInSnapshotAudience).toBe(1);
    expect(report.pendingCount).toBe(2);
    expect(report.acknowledgedOutsideSnapshotAudience).toBe(1);
    expect(report.byUnit).toEqual([
      { unit: '', audience: 1, acknowledged: 0 },
      { unit: 'IT', audience: 2, acknowledged: 1 },
    ]);
    expect(report.pending.map((entry) => entry.id)).toEqual(['user-2', 'user-3']);
  });
});
