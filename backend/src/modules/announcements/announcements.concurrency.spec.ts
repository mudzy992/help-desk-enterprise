jest.mock('../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));

import type { PrincipalContext } from '../../common/principal-context/principal-context.types';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthorizationService } from '../authorization/authorization.service';
import { permissionKeys } from '../authorization/authorization.constants';
import { announcementErrorCodes } from './announcements.constants';
import { announcementViewerFromContext } from './announcement-viewer';
import { AnnouncementsService } from './announcements.service';

const now = new Date('2026-10-29T12:00:00.000Z');

function viewer() {
  const context: PrincipalContext = {
    subjectId: 'actor-1',
    email: 'actor@example.invalid',
    displayName: 'Global manager',
    isActive: true,
    isLocalOnly: false,
    mustChangePassword: false,
    entraObjectId: null,
    roleKeys: [],
    groupIds: [],
    homeOrganizationalUnitId: null,
    assignments: [
      {
        roleKey: 'ADMIN',
        permissionKeys: [permissionKeys.announcementManage],
        organizationalUnitId: null,
        organizationalUnitPath: null,
        serviceId: null,
      },
    ],
    authzVersion: 1,
  };
  return announcementViewerFromContext(context, context.subjectId);
}

const baseInput = {
  title: 'Notice',
  body: 'Announcement body.',
  severity: 'INFO' as const,
  displayMode: 'BANNER' as const,
  requiresAcknowledgement: false,
  notifyAudience: false,
  startsAt: now.toISOString(),
  endsAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
  roles: [],
  organizationalUnitIds: [],
  groupIds: [] as string[],
};

function rowFixture(status: string) {
  return {
    id: 'ann-1',
    title: baseInput.title,
    body: baseInput.body,
    severity: 'INFO',
    displayMode: 'BANNER',
    requiresAcknowledgement: false,
    notifyAudience: false,
    sendEmail: false,
    postToTeams: false,
    startsAt: new Date(baseInput.startsAt),
    endsAt: new Date(baseInput.endsAt),
    audienceRoles: [],
    audienceOrganizationalUnitIds: [],
    audienceGroupIds: [],
    serviceId: null,
    status,
    version: 3,
    createdById: 'actor-1',
    publishedAt: status === 'DRAFT' ? null : now,
    withdrawnAt: null,
    audienceSizeAtPublish: 0,
    anonymizedAcknowledgements: 0,
    audienceNotifiedAt: null,
    lastReminderAt: null,
    teamsPostedAt: null,
    teamsResult: null,
    createdAt: now,
    updatedAt: now,
  };
}

function setup(status: string, casCount: number) {
  const row = rowFixture(status);
  const tx = {
    announcement: {
      updateMany: jest.fn(async () => ({ count: casCount })),
      update: jest.fn(async () => ({})),
      deleteMany: jest.fn(async () => ({ count: casCount })),
    },
    // BA-announcements-13: publish also captures the membership snapshot.
    user: { findMany: jest.fn(async () => []) },
    announcementAudienceMember: { createMany: jest.fn(async () => ({ count: 0 })) },
    announcementRevision: { create: jest.fn(async () => ({})) },
    auditLog: { create: jest.fn(async () => ({})), findFirst: jest.fn(async () => null) },
    $executeRaw: jest.fn(async () => 0),
  };
  const transaction = jest.fn(async (operation: (client: unknown) => Promise<unknown>) => operation(tx));
  const prisma = {
    announcement: { findUnique: jest.fn(async () => row), findMany: jest.fn(async () => []) },
    announcementRevision: { findMany: jest.fn(async () => []) },
    organizationalUnit: { findMany: jest.fn(async () => []) },
    group: {
      count: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.length),
      findMany: jest.fn(async () => []),
    },
    service: { findUnique: jest.fn(async () => ({ id: 'svc-1' })), findMany: jest.fn(async () => []) },
    user: { count: jest.fn(async () => 0) },
    $transaction: transaction,
  };
  const settings = {
    getSetting: jest.fn(async (key: string) => (key === 'private.announcements.enabled' ? true : null)),
  };
  const authorization = {
    authorizeResource: jest.fn(async () => ({ allowed: true, reason: 'GLOBAL_PERMISSION' as const })),
  } as unknown as AuthorizationService;
  const service = new AnnouncementsService(prisma as unknown as PrismaService, settings as never, authorization);
  return { service, tx, transaction };
}

describe('AnnouncementsService version CAS (BA-announcements-06)', () => {
  it('draft update writes through a version predicate and increments the version', async () => {
    const { service, tx } = setup('DRAFT', 1);
    await service.update('ann-1', baseInput, viewer(), 3, now);
    expect(tx.announcement.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ann-1', version: 3 },
        data: expect.objectContaining({ version: 4 }),
      }),
    );
  });

  it('stale draft update is rejected as a version conflict', async () => {
    const { service } = setup('DRAFT', 0);
    await expect(service.update('ann-1', baseInput, viewer(), 3, now)).rejects.toMatchObject({
      code: announcementErrorCodes.versionConflict,
    });
  });

  it('publish carries both the DRAFT status predicate and the version predicate', async () => {
    const { service, tx } = setup('DRAFT', 1);
    await service.publish('ann-1', viewer(), 3, now);
    expect(tx.announcement.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ann-1', status: 'DRAFT', version: 3 },
        data: expect.objectContaining({ status: 'PUBLISHED', version: 4 }),
      }),
    );
  });

  it('a published severity-only edit leaves a full snapshot of the replaced state', async () => {
    const { service, tx } = setup('PUBLISHED', 1);
    await service.update('ann-1', { ...baseInput, severity: 'WARNING' }, viewer(), 3, now);
    expect(tx.announcementRevision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        announcementId: 'ann-1',
        version: 3,
        severity: 'INFO',
        displayMode: 'BANNER',
        serviceId: null,
        notifyAudience: false,
        sendEmail: false,
        postToTeams: false,
      }),
    });
  });

  it('stale withdraw is rejected as a version conflict instead of overwriting state', async () => {
    const { service } = setup('PUBLISHED', 0);
    await expect(service.withdraw('ann-1', 'reason', viewer(), 3, now)).rejects.toMatchObject({
      code: announcementErrorCodes.versionConflict,
    });
  });

  it('stale draft delete is rejected as a version conflict', async () => {
    const { service } = setup('DRAFT', 0);
    await expect(service.remove('ann-1', viewer(), 3)).rejects.toMatchObject({
      code: announcementErrorCodes.versionConflict,
    });
  });
});
