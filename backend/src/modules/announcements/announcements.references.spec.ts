jest.mock('../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));

import type { PrincipalContext } from '../../common/principal-context/principal-context.types';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthorizationService } from '../authorization/authorization.service';
import { permissionKeys } from '../authorization/authorization.constants';
import { announcementErrorCodes } from './announcements.constants';
import { announcementViewerFromContext } from './announcement-viewer';
import { AnnouncementsService } from './announcements.service';

const now = new Date('2026-10-29T12:00:00.000Z');
const units = [
  { id: 'ou-it', name: 'IT', ouPath: '/root/IT' },
  { id: 'ou-hr', name: 'HR', ouPath: '/root/HR' },
];
const groups = [
  { id: 'group-it', name: 'IT Group', organizationalUnitId: 'ou-it' },
  { id: 'group-hr', name: 'HR Group', organizationalUnitId: 'ou-hr' },
];

function viewer() {
  const context: PrincipalContext = {
    subjectId: 'actor-1',
    email: 'actor@example.invalid',
    displayName: 'Scoped manager',
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
        organizationalUnitId: 'ou-it',
        organizationalUnitPath: '/root/IT',
        serviceId: null,
      },
    ],
    authzVersion: 1,
  };
  return announcementViewerFromContext(context, context.subjectId);
}

const baseInput = {
  title: 'IT notice',
  body: 'Scoped announcement body.',
  severity: 'INFO' as const,
  displayMode: 'BANNER' as const,
  requiresAcknowledgement: false,
  notifyAudience: false,
  startsAt: now.toISOString(),
  endsAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
  roles: [],
  organizationalUnitIds: ['ou-it'],
  groupIds: [] as string[],
};

function setup() {
  const createdRow = {
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
    audienceOrganizationalUnitIds: ['ou-it'],
    audienceGroupIds: ['group-it'],
    serviceId: null,
    status: 'DRAFT',
    version: 1,
    createdById: 'actor-1',
    publishedAt: null,
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
  const tx = {
    announcement: { create: jest.fn(async () => createdRow) },
    auditLog: { create: jest.fn(async () => ({})), findFirst: jest.fn(async () => null) },
    $executeRaw: jest.fn(async () => 0),
  };
  const transaction = jest.fn(async (operation: (client: unknown) => Promise<unknown>) => operation(tx));
  const prisma = {
    announcement: {
      findMany: jest.fn(async () => []),
      findUnique: jest.fn(async () => createdRow),
    },
    announcementRevision: { findMany: jest.fn(async () => []) },
    organizationalUnit: { findMany: jest.fn(async () => units) },
    group: {
      count: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.length),
      findMany: jest.fn(async ({ where }: { where?: { id?: { in: string[] } } }) =>
        where?.id?.in === undefined ? groups : groups.filter((group) => where.id!.in.includes(group.id)),
      ),
    },
    service: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => ({ id: where.id })),
      findMany: jest.fn(async () => [{ id: 'svc-1', name: 'Service One' }]),
    },
    $transaction: transaction,
  };
  const settings = {
    getSetting: jest.fn(async (key: string) => (key === 'private.announcements.enabled' ? true : null)),
  };
  const authorization = {
    authorizeResource: jest.fn(async (request: { organizationalUnitId: string | null }) => ({
      allowed: request.organizationalUnitId === 'ou-it',
      reason:
        request.organizationalUnitId === 'ou-it'
          ? ('OU_ASSIGNMENT_ALLOWED' as const)
          : ('NO_MATCHING_PERMISSION_SCOPE' as const),
    })),
  } as unknown as AuthorizationService;
  const service = new AnnouncementsService(prisma as unknown as PrismaService, settings as never, authorization);
  return { service, prisma, transaction, tx };
}

describe('AnnouncementsService group/service reference scope (BA-announcements-05)', () => {
  it('rejects a group outside the manager OU subtree before any transaction', async () => {
    const { service, transaction } = setup();
    await expect(
      service.create({ ...baseInput, groupIds: ['group-hr'] }, viewer(), now),
    ).rejects.toMatchObject({ code: announcementErrorCodes.invalidAudience, detail: 'group' });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects any service reference for a scoped manager (service has no OU anchor)', async () => {
    const { service, transaction } = setup();
    await expect(
      service.create({ ...baseInput, serviceId: 'svc-1' }, viewer(), now),
    ).rejects.toMatchObject({ code: announcementErrorCodes.invalidAudience, detail: 'service' });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('accepts a group inside the manager OU subtree', async () => {
    const { service, tx } = setup();
    const result = await service.create({ ...baseInput, groupIds: ['group-it'] }, viewer(), now);
    expect(result.id).toBe('ann-1');
    expect(tx.announcement.create).toHaveBeenCalledTimes(1);
  });

  it('offers no services and only in-scope groups in editor options for a scoped manager', async () => {
    const { service } = setup();
    const result = await service.options(viewer());
    expect(result.services).toEqual([]);
    expect(result.groups.map((group) => group.id)).toEqual(['group-it']);
  });
});
