jest.mock('../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));

import type { PrincipalContext } from '../../common/principal-context/principal-context.types';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthorizationService } from '../authorization/authorization.service';
import { permissionKeys } from '../authorization/authorization.constants';
import { announcementErrorCodes, AnnouncementError } from './announcements.constants';
import { announcementViewerFromContext } from './announcement-viewer';
import { AnnouncementsService } from './announcements.service';

const now = new Date('2026-10-29T12:00:00.000Z');
const units = [
  { id: 'ou-it', name: 'IT', ouPath: '/root/IT' },
  { id: 'ou-hr', name: 'HR', ouPath: '/root/HR' },
];

function viewer(input: { readonly manageUnitId?: string; readonly reportUnitId?: string } = {}) {
  const manageUnitId = input.manageUnitId ?? 'ou-it';
  const reportUnitId = input.reportUnitId ?? 'ou-it';
  const unitPaths = new Map(units.map((unit) => [unit.id, unit.ouPath]));
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
        organizationalUnitId: manageUnitId,
        organizationalUnitPath: unitPaths.get(manageUnitId) ?? null,
        serviceId: null,
      },
      {
        roleKey: 'ADMIN',
        permissionKeys: [permissionKeys.announcementReportRead],
        organizationalUnitId: reportUnitId,
        organizationalUnitPath: unitPaths.get(reportUnitId) ?? null,
        serviceId: null,
      },
    ],
    authzVersion: 1,
  };
  return announcementViewerFromContext(context, context.subjectId);
}

function row(id: string, audienceOrganizationalUnitIds: string[]) {
  return {
    id,
    title: `${id} announcement`,
    body: 'Internal notice',
    severity: 'INFO' as const,
    displayMode: 'BANNER' as const,
    requiresAcknowledgement: true,
    notifyAudience: false,
    startsAt: new Date('2026-10-29T00:00:00.000Z'),
    endsAt: new Date('2026-11-05T00:00:00.000Z'),
    audienceRoles: [],
    audienceOrganizationalUnitIds,
    audienceGroupIds: [],
    serviceId: null,
    status: 'PUBLISHED' as const,
    version: 1,
    createdById: 'actor-1',
    publishedAt: new Date('2026-10-29T00:00:00.000Z'),
    withdrawnAt: null,
    audienceSizeAtPublish: 3,
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
}

function setup(input: { readonly rows?: readonly ReturnType<typeof row>[] } = {}) {
  const announcementRows = [...(input.rows ?? [])];
  const prisma = {
    announcement: {
      findMany: jest.fn(async () => announcementRows),
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => announcementRows.find((item) => item.id === where.id) ?? null),
    },
    $transaction: jest.fn(),
    organizationalUnit: { findMany: jest.fn(async () => units) },
    announcementAcknowledgement: {
      groupBy: jest.fn(async () => []),
      findMany: jest.fn(async () => []),
    },
    announcementRevision: { findMany: jest.fn(async () => []) },
    announcementEmailRun: { findMany: jest.fn(async () => []) },
    user: {
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0),
    },
    group: { count: jest.fn(async () => 0) },
    service: { findUnique: jest.fn(async () => null) },
  };
  const settings = {
    getSetting: jest.fn(async (key: string) => (key === 'private.announcements.enabled' ? true : null)),
  };
  const authorization = {
    authorizeResource: jest.fn(async (request: { organizationalUnitId: string | null }) => ({
      allowed: request.organizationalUnitId === 'ou-it',
      reason: request.organizationalUnitId === 'ou-it' ? 'OU_ASSIGNMENT_ALLOWED' as const : 'NO_MATCHING_PERMISSION_SCOPE' as const,
    })),
  } as unknown as AuthorizationService & { authorizeResource: jest.Mock };
  const service = new AnnouncementsService(prisma as unknown as PrismaService, settings as never, authorization);
  return { service, prisma, authorization };
}

describe('AnnouncementsService scoped management and report authorization', () => {
  it('filters the manage list by all audience OUs before loading acknowledgement counts', async () => {
    const itAnnouncement = row('it-only', ['ou-it']);
    const crossOuAnnouncement = row('it-and-hr', ['ou-it', 'ou-hr']);
    const { service, prisma } = setup({ rows: [itAnnouncement, crossOuAnnouncement] });

    const result = await service.list(viewer(), now);

    expect(result.announcements.map((announcement) => announcement.id)).toEqual(['it-only']);
    expect(prisma.announcementAcknowledgement.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: { announcementId: { in: ['it-only'] } },
    }));
  });

  it('rejects a cross-OU create before any mutation transaction', async () => {
    const { service, prisma } = setup();
    const input = {
      title: 'IT and HR notice',
      body: 'A scoped manager must not publish this to another OU.',
      severity: 'INFO' as const,
      displayMode: 'BANNER' as const,
      requiresAcknowledgement: false,
      notifyAudience: false,
      startsAt: now.toISOString(),
      endsAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      roles: [],
      organizationalUnitIds: ['ou-it', 'ou-hr'],
      groupIds: [],
    };

    await expect(service.create(input, viewer(), now)).rejects.toMatchObject({
      code: announcementErrorCodes.invalidAudience,
      detail: 'scope',
    } satisfies Partial<AnnouncementError>);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('uses the report permission scope independently from the manage permission scope', async () => {
    const { service, authorization } = setup({ rows: [row('hr-report', ['ou-hr'])] });
    authorization.authorizeResource.mockImplementation(async (request: { organizationalUnitId: string | null }) => ({
      allowed: request.organizationalUnitId === 'ou-hr',
      reason: request.organizationalUnitId === 'ou-hr' ? 'OU_ASSIGNMENT_ALLOWED' : 'NO_MATCHING_PERMISSION_SCOPE',
    }));

    const result = await service.report('hr-report', viewer({ manageUnitId: 'ou-it', reportUnitId: 'ou-hr' }));

    expect(result.id).toBe('hr-report');
  });

  it('denies CSV before querying any audience identities or acknowledgements outside the manager OU', async () => {
    const { service, prisma } = setup({ rows: [row('hr-private', ['ou-hr'])] });

    await expect(service.reportCsv('hr-private', viewer())).rejects.toMatchObject({
      code: announcementErrorCodes.notFound,
    });
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(prisma.announcementAcknowledgement.findMany).not.toHaveBeenCalled();
  });

  it('denies reports for an audience without an OU filter to a scoped grant', async () => {
    const { service, prisma } = setup({ rows: [row('org-wide', [])] });

    await expect(service.report('org-wide', viewer())).rejects.toMatchObject({
      code: announcementErrorCodes.notFound,
    });
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(prisma.announcementAcknowledgement.findMany).not.toHaveBeenCalled();
  });
});
