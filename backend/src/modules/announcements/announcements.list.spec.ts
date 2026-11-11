jest.mock('../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));

import { permissionKeys } from '../authorization/authorization.constants';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthorizationService } from '../authorization/authorization.service';
import type { PrincipalContext } from '../../common/principal-context/principal-context.types';
import { announcementViewerFromContext } from './announcement-viewer';
import { AnnouncementsService } from './announcements.service';

const now = new Date('2026-10-29T12:00:00.000Z');

function makeRow(id: string, createdAtMs: number, organizationalUnitIds: string[]) {
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
    audienceOrganizationalUnitIds: organizationalUnitIds,
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
    createdAt: new Date(createdAtMs),
    updatedAt: new Date(createdAtMs),
  };
}

const units = [
  { id: 'ou-it', name: 'IT', ouPath: '/root/IT' },
  { id: 'ou-hr', name: 'HR', ouPath: '/root/HR' },
];

function scopedViewer() {
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

type FindManyQuery = {
  readonly where?: {
    readonly OR?: ReadonlyArray<{
      readonly createdAt?: { readonly lt?: Date };
      readonly AND?: ReadonlyArray<{ readonly createdAt?: Date; readonly id?: { readonly lt?: string } }>;
    }>;
  };
  readonly take: number;
};

function setup(totalForeign: number, ownCount: number) {
  const rows: Array<ReturnType<typeof makeRow>> = [];
  // Newest first: many HR (foreign) announcements, then the actor's IT ones.
  for (let index = 0; index < totalForeign; index += 1) {
    rows.push(makeRow(`hr-${String(index).padStart(4, '0')}`, 10_000 - index, ['ou-hr']));
  }
  for (let index = 0; index < ownCount; index += 1) {
    rows.push(makeRow(`it-${String(index).padStart(4, '0')}`, 5_000 - index, ['ou-it']));
  }
  rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1));
  const prisma = {
    announcement: {
      findMany: jest.fn(async (query: FindManyQuery) => {
        let result = rows;
        const or = query.where?.OR;
        if (or !== undefined) {
          const lt = or[0]?.createdAt?.lt;
          const eqTerm = or[1]?.AND?.[0]?.createdAt;
          const idLt = or[1]?.AND?.[1]?.id?.lt;
          result = rows.filter(
            (row) =>
              (lt !== undefined && row.createdAt.getTime() < lt.getTime()) ||
              (eqTerm !== undefined && idLt !== undefined && row.createdAt.getTime() === eqTerm.getTime() && row.id < idLt),
          );
        }
        return result.slice(0, query.take);
      }),
    },
    organizationalUnit: { findMany: jest.fn(async () => units) },
    announcementAcknowledgement: {
      groupBy: jest.fn(async () => []),
      count: jest.fn(async () => 0),
      findMany: jest.fn(async () => []),
    },
    announcementAudienceMember: {
      count: jest.fn(async () => 0),
      groupBy: jest.fn(async () => []),
      findMany: jest.fn(async () => []),
    },
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
  const service = new AnnouncementsService(
    prisma as unknown as PrismaService,
    { getSetting: jest.fn(async () => true) } as never,
    authorization,
  );
  return { service, prisma };
}

describe('BA-announcements-14 manage list scope paging', () => {
  it('finds in-scope announcements behind more than one global page of foreign ones', async () => {
    const { service, prisma } = setup(250, 3);
    const result = await service.list(scopedViewer(), now);
    expect(result.announcements.map((announcement) => announcement.id)).toEqual(['it-0000', 'it-0001', 'it-0002']);
    expect(result.truncated).toBe(false);
    expect(prisma.announcement.findMany.mock.calls.length).toBeGreaterThan(1);
  });

  it('caps the returned in-scope announcements at the list limit and flags truncation', async () => {
    const { service } = setup(0, 205);
    const result = await service.list(scopedViewer(), now);
    expect(result.announcements).toHaveLength(200);
    expect(result.listLimit).toBe(200);
    expect(result.truncated).toBe(true);
  });
});
