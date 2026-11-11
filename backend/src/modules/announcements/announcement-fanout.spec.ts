jest.mock('../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));
jest.mock('../audit-log/record-audit-entry', () => ({ recordAuditEntry: jest.fn() }));

import type { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthorizationService } from '../authorization/authorization.service';
import { announcementLimits } from './announcements.constants';
import type { AnnouncementViewer } from './announcement-viewer';
import { AnnouncementsService } from './announcements.service';

const now = new Date('2026-10-29T12:00:00.000Z');
const announcementId = 'announcement-large-audience';

const row = {
  id: announcementId,
  title: 'Important announcement',
  body: 'Please read this update.',
  severity: 'CRITICAL' as const,
  displayMode: 'BANNER' as const,
  requiresAcknowledgement: true,
  notifyAudience: true,
  startsAt: new Date('2026-10-29T00:00:00.000Z'),
  endsAt: new Date('2026-10-30T00:00:00.000Z'),
  audienceRoles: ['USER'],
  audienceOrganizationalUnitIds: [],
  audienceGroupIds: [],
  serviceId: null,
  status: 'PUBLISHED' as const,
  version: 1,
  createdById: 'manager-1',
  publishedAt: new Date('2026-10-29T00:00:00.000Z'),
  withdrawnAt: null,
  audienceSizeAtPublish: null,
  anonymizedAcknowledgements: 0,
  audienceNotifiedAt: null,
  lastReminderAt: null,
  sendEmail: false,
  postToTeams: false,
  teamsPostedAt: null,
  teamsResult: null,
  createdAt: new Date('2026-10-28T00:00:00.000Z'),
  updatedAt: new Date('2026-10-29T00:00:00.000Z'),
};

const manager: AnnouncementViewer = {
  userId: 'manager-1',
  roleKeys: ['ADMIN'],
  groupIds: [],
  homeOrganizationalUnitId: null,
  authorizationPrincipal: {
    subjectId: 'manager-1',
    email: 'manager@example.invalid',
    displayName: 'Announcement manager',
    isLocalOnly: false,
  },
  manageScope: { global: true, organizationalUnits: [] },
  reportScope: { global: true, organizationalUnits: [] },
  canManageAll: true,
  canReadReports: true,
  isAgent: false,
};

type FanOutMethod = (
  userIds: readonly string[],
  type: string,
  announcement: unknown,
  dedupePrefix: string,
) => Promise<number>;

type UserQuery = {
  readonly where: {
    readonly id?: { readonly gt?: string };
    readonly isActive?: boolean;
    readonly anonymizedAt?: null;
    readonly announcementAcknowledgements?: { readonly none: { readonly announcementId: string } };
  };
  readonly orderBy: { readonly id: 'asc' };
  readonly take: number;
};

function setup(totalUsers: number) {
  const userIds = Array.from({ length: totalUsers }, (_, index) => `user-${String(index).padStart(6, '0')}`);
  const queries: UserQuery[] = [];
  const prisma = {
    announcement: {
      updateMany: jest.fn(async () => ({ count: 1 })),
      findFirst: jest.fn(async () => row),
      findUnique: jest.fn(async () => row),
    },
    user: {
      findMany: jest.fn(async (query: UserQuery) => {
        queries.push(query);
        const cursor = query.where.id?.gt;
        return userIds
          .filter((id) => cursor === undefined || id > cursor)
          .slice(0, query.take)
          .map((id) => ({ id }));
      }),
    },
    organizationalUnit: { findMany: jest.fn(async () => []) },
    announcementEmailRun: { create: jest.fn(async () => ({ id: 'email-run-1' })) },
  };
  const settings = { getSetting: jest.fn(async () => true) };
  const authorization = {
    authorizeResource: jest.fn(async () => ({ allowed: true, reason: 'GLOBAL_ASSIGNMENT_ALLOWED' as const })),
  } as unknown as AuthorizationService;
  const service = new AnnouncementsService(prisma as unknown as PrismaService, settings as never, authorization);
  const fanOut = jest.spyOn(service as unknown as { fanOut: FanOutMethod }, 'fanOut');
  fanOut.mockImplementation(async (ids) => ids.length);
  return { service, prisma, fanOut, queries, userIds };
}

describe('AnnouncementsService audience fan-out pagination', () => {
  it('notifies the complete publication audience beyond 20,000 in bounded keyset pages', async () => {
    const totalUsers = 20_005;
    const { service, prisma, fanOut, queries, userIds } = setup(totalUsers);

    const notified = await service.notifyStarted(announcementId, now);

    expect(notified).toBe(totalUsers);
    expect(fanOut).toHaveBeenCalledTimes(Math.ceil(totalUsers / announcementLimits.notifyBatchSize));
    const deliveredIds = fanOut.mock.calls.flatMap(([ids]) => [...ids]);
    expect(deliveredIds).toEqual(userIds);
    expect(queries).toHaveLength(Math.ceil(totalUsers / announcementLimits.notifyBatchSize));
    expect(queries[0]).toMatchObject({
      where: { isActive: true, anonymizedAt: null, userRoles: { some: { role: { key: { in: ['USER'] } } } } },
      orderBy: { id: 'asc' },
      take: announcementLimits.notifyBatchSize,
    });
    expect(queries[1]?.where.id).toEqual({ gt: userIds[announcementLimits.notifyBatchSize - 1] });
    expect(queries.every((query) => query.take <= announcementLimits.notifyBatchSize)).toBe(true);
    expect(prisma.announcement.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ audienceNotifiedAt: null }),
      data: { audienceNotifiedAt: now },
    }));
    expect(prisma.announcement.updateMany.mock.invocationCallOrder[0]).toBeGreaterThan(
      fanOut.mock.invocationCallOrder[fanOut.mock.invocationCallOrder.length - 1] ?? 0,
    );
  });

  it('does not set the completion marker when a publication page fails', async () => {
    const { service, prisma, fanOut } = setup(1);
    fanOut.mockRejectedValueOnce(new Error('temporary database error'));

    await expect(service.notifyStarted(announcementId, now)).rejects.toThrow('temporary database error');

    expect(prisma.announcement.updateMany).not.toHaveBeenCalled();
  });

  it('does not consume the reminder interval when a fan-out page fails', async () => {
    const { service, prisma, fanOut } = setup(1);
    fanOut.mockRejectedValueOnce(new Error('temporary database error'));

    await expect(service.remind(announcementId, manager, now)).rejects.toThrow('temporary database error');

    expect(prisma.announcement.updateMany).not.toHaveBeenCalled();
  });

  it('continues acknowledgement reminders across pages without dropping eligible users', async () => {
    const totalUsers = announcementLimits.notifyBatchSize + 17;
    const { service, prisma, fanOut, queries, userIds } = setup(totalUsers);

    const result = await service.remind(announcementId, manager, now);

    expect(result).toEqual({ notified: totalUsers, emailQueued: false });
    expect(fanOut).toHaveBeenCalledTimes(2);
    expect(fanOut.mock.calls.flatMap(([ids]) => [...ids])).toEqual(userIds);
    expect(queries).toHaveLength(2);
    expect(queries.every((query) =>
      query.where.announcementAcknowledgements?.none.announcementId === announcementId,
    )).toBe(true);
    expect(prisma.announcement.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { lastReminderAt: now },
    }));
    expect(prisma.announcement.updateMany.mock.invocationCallOrder[0]).toBeGreaterThan(
      fanOut.mock.invocationCallOrder[fanOut.mock.invocationCallOrder.length - 1] ?? 0,
    );
  });
});
