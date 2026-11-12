jest.mock('../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));
jest.mock('../audit-log/append-audit-log', () => ({ appendAuditLog: jest.fn(async () => undefined) }));

import type { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthorizationService } from '../authorization/authorization.service';
import { AnnouncementsService } from './announcements.service';

const now = new Date('2026-10-29T12:00:00.000Z');

function setup(options: { readonly heldUsers?: number; readonly satellites?: boolean } = {}) {
  const satellites = options.satellites !== false;
  const deleted: string[] = [];
  const client = {
    announcement: {
      findMany: jest.fn(async () => [{ id: 'ann-old' }]),
      findUnique: jest.fn(
        async (): Promise<{ teamsPostedAt: Date | null; teamsResult: string | null }> => ({
          teamsPostedAt: new Date(),
          teamsResult: 'SENT',
        }),
      ),
      update: jest.fn(async () => {
        deleted.push('teams-cleared');
        return {};
      }),
    },
    announcementRevision: {
      count: jest.fn(async () => (satellites ? 2 : 0)),
      deleteMany: jest.fn(async () => {
        deleted.push('revisions');
        return { count: 2 };
      }),
    },
    announcementEmailRun: {
      count: jest.fn(async () => (satellites ? 1 : 0)),
      deleteMany: jest.fn(async () => {
        deleted.push('runs');
        return { count: 1 };
      }),
    },
    announcementAudienceMember: {
      count: jest.fn(async () => (satellites ? 3 : 0)),
      findMany: jest.fn(async () => [{ userId: 'user-1' }, { userId: 'user-2' }]),
      deleteMany: jest.fn(async () => {
        deleted.push('members');
        return { count: 3 };
      }),
    },
    notification: {
      count: jest.fn(async () => (satellites ? 4 : 0)),
      deleteMany: jest.fn(async () => {
        deleted.push('notifications');
        return { count: 4 };
      }),
    },
    announcementAcknowledgement: {
      findMany: jest.fn(async () => [{ userId: 'user-2' }]),
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
    announcementDismissal: {
      findMany: jest.fn(async () => []),
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
    user: { count: jest.fn(async () => options.heldUsers ?? 0) },
  };
  const prisma = {
    ...client,
    $transaction: jest.fn(async (operation: (tx: unknown) => Promise<unknown>) => operation(client)),
  };
  const service = new AnnouncementsService(
    prisma as unknown as PrismaService,
    {
      getSetting: jest.fn(async (key: string) =>
        key === 'private.announcements.receiptRetentionDays' ? 365 : true,
      ),
    } as never,
    {} as AuthorizationService,
  );
  return { service, client, prisma, deleted };
}

type SweepMethod = (now: Date) => Promise<unknown>;
type RetentionMethod = (announcementId: string) => Promise<unknown>;

describe('BA-announcements-15 satellite retention matrix', () => {
  it('deletes revisions, runs, snapshot members and notifications and clears Teams evidence', async () => {
    const { service, deleted } = setup();
    const retain = (service as unknown as { retainAnnouncementSatellites: RetentionMethod })
      .retainAnnouncementSatellites.bind(service);
    const result = (await retain('ann-old')) as Record<string, number> | null;
    expect(result).toEqual({ revisions: 2, emailRuns: 1, audienceMembers: 3, notifications: 4 });
    expect(deleted).toEqual(['revisions', 'runs', 'members', 'notifications', 'teams-cleared']);
  });

  it('keeps every satellite when any involved user is under legal hold', async () => {
    const { service, deleted } = setup({ heldUsers: 1 });
    const retain = (service as unknown as { retainAnnouncementSatellites: RetentionMethod })
      .retainAnnouncementSatellites.bind(service);
    await expect(retain('ann-old')).resolves.toBeNull();
    expect(deleted).toEqual([]);
  });

  it('does nothing when the announcement has no satellites left', async () => {
    const { service, client, prisma } = setup({ satellites: false });
    // Teams evidence is also absent in this variant.
    client.announcement.findUnique.mockResolvedValue({ teamsPostedAt: null, teamsResult: null });
    const retain = (service as unknown as { retainAnnouncementSatellites: RetentionMethod })
      .retainAnnouncementSatellites.bind(service);
    await expect(retain('ann-old')).resolves.toBeNull();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('sweep retention reaches the satellite pass for ended announcements', async () => {
    const { service, client } = setup();
    const sweep = (service as unknown as { sweep: SweepMethod }).sweep;
    // The sweep also needs due/missed queries; make them empty.
    client.announcement.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    await sweep.call(service, now);
    expect(client.announcementRevision.deleteMany).toHaveBeenCalled();
  });
});
