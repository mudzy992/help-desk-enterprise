import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import type { AnnouncementViewer } from './announcement-viewer';
import { AnnouncementsService } from './announcements.service';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

const now = new Date('2026-10-29T12:00:00.000Z');

type AnnouncementFixture = {
  readonly id: string;
  readonly severity: 'INFO' | 'CRITICAL';
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly audienceRoles: string[];
  readonly audienceOrganizationalUnitIds: string[];
  readonly audienceGroupIds: string[];
};

function fixture(input: AnnouncementFixture) {
  return {
    ...input,
    title: `Announcement ${input.id}`,
    body: 'Visibility regression fixture',
    displayMode: 'BANNER' as const,
    requiresAcknowledgement: false,
    status: 'PUBLISHED' as const,
    createdAt: now,
    updatedAt: now,
  };
}

describeIfDatabase('announcement active/archive audience cap (PostgreSQL integration, BA-announcements-02)', () => {
  jest.setTimeout(120_000);

  let prisma: PrismaClient;
  let announcements: AnnouncementsService;
  const createdUnitIds: string[] = [];
  const createdChildUnitIds: string[] = [];
  const stamp = `${Date.now()}${Math.floor(Math.random() * 10_000)}`;
  const idPrefix = `ba02-${stamp}`;
  const groupId = `${idPrefix}-group`;
  const homeUnitId = `${idPrefix}-home-ou`;
  const viewer: AnnouncementViewer = {
    userId: `${idPrefix}-viewer`,
    roleKeys: ['AGENT'],
    groupIds: [groupId],
    homeOrganizationalUnitId: homeUnitId,
    authorizationPrincipal: null,
    manageScope: { global: false, organizationalUnits: [] },
    reportScope: { global: false, organizationalUnits: [] },
    canManageAll: false,
    canReadReports: false,
    isAgent: false,
  };

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    const root = await prisma.organizationalUnit.create({
      data: {
        name: `BA02 root ${stamp}`,
        type: 'DIRECTORATE',
        distinguishedName: `OU=BA02Root${stamp}`,
        ouPath: `/ba02-${stamp}`,
      },
      select: { id: true, ouPath: true },
    });
    createdUnitIds.push(root.id);
    const home = await prisma.organizationalUnit.create({
      data: {
        id: homeUnitId,
        name: `BA02 home ${stamp}`,
        type: 'SERVICE',
        distinguishedName: `OU=BA02Home${stamp}`,
        ouPath: `${root.ouPath}/home`,
        parentId: root.id,
      },
      select: { id: true },
    });
    createdUnitIds.push(home.id);
    createdChildUnitIds.push(home.id);
    const foreign = await prisma.organizationalUnit.create({
      data: {
        name: `BA02 foreign ${stamp}`,
        type: 'DIRECTORATE',
        distinguishedName: `OU=BA02Foreign${stamp}`,
        ouPath: `/ba02-foreign-${stamp}`,
      },
      select: { id: true },
    });
    createdUnitIds.push(foreign.id);
    const settings = { getSetting: async () => true };
    announcements = new AnnouncementsService(prisma as never, settings as never, {} as never);

    const activeRows: AnnouncementFixture[] = [
      ...Array.from({ length: 50 }, (_, index) => ({
        id: `${idPrefix}-foreign-active-${String(index).padStart(3, '0')}`,
        severity: 'CRITICAL' as const,
        startsAt: new Date(now.getTime() - index - 1),
        endsAt: new Date(now.getTime() + 86_400_000),
        audienceRoles: ['AGENT'],
        audienceOrganizationalUnitIds: [foreign.id],
        audienceGroupIds: [groupId],
      })),
      ...Array.from({ length: 50 }, (_, index) => ({
        id: `${idPrefix}-visible-info-${String(index).padStart(3, '0')}`,
        severity: 'INFO' as const,
        startsAt: new Date(now.getTime() - 60_000 - index * 1_000),
        endsAt: new Date(now.getTime() + 86_400_000),
        audienceRoles: [],
        audienceOrganizationalUnitIds: [],
        audienceGroupIds: [],
      })),
      {
        id: `${idPrefix}-visible-critical`,
        severity: 'CRITICAL',
        startsAt: new Date(now.getTime() - 120_000),
        endsAt: new Date(now.getTime() + 86_400_000),
        audienceRoles: ['AGENT'],
        audienceOrganizationalUnitIds: [root.id],
        audienceGroupIds: [groupId],
      },
      {
        id: `${idPrefix}-wrong-role`,
        severity: 'CRITICAL',
        startsAt: new Date(now.getTime() - 100),
        endsAt: new Date(now.getTime() + 86_400_000),
        audienceRoles: ['ADMIN'],
        audienceOrganizationalUnitIds: [root.id],
        audienceGroupIds: [groupId],
      },
      {
        id: `${idPrefix}-wrong-group`,
        severity: 'CRITICAL',
        startsAt: new Date(now.getTime() - 101),
        endsAt: new Date(now.getTime() + 86_400_000),
        audienceRoles: ['AGENT'],
        audienceOrganizationalUnitIds: [root.id],
        audienceGroupIds: [`${idPrefix}-other-group`],
      },
    ];
    const archivedRows: AnnouncementFixture[] = [
      ...Array.from({ length: 101 }, (_, index) => ({
        id: `${idPrefix}-foreign-archive-${String(index).padStart(3, '0')}`,
        severity: 'INFO' as const,
        startsAt: new Date(now.getTime() - 25 * 3_600_000 - index * 3_600_000),
        endsAt: new Date(now.getTime() - 86_400_000),
        audienceRoles: ['AGENT'],
        audienceOrganizationalUnitIds: [foreign.id],
        audienceGroupIds: [groupId],
      })),
      {
        id: `${idPrefix}-visible-archive`,
        severity: 'INFO',
        startsAt: new Date(now.getTime() - 7 * 86_400_000),
        endsAt: new Date(now.getTime() - 86_400_000),
        audienceRoles: ['AGENT'],
        audienceOrganizationalUnitIds: [root.id],
        audienceGroupIds: [groupId],
      },
    ];
    await prisma.announcement.createMany({ data: [...activeRows, ...archivedRows].map(fixture) });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.announcement.deleteMany({ where: { id: { startsWith: idPrefix } } });
    if (createdChildUnitIds.length > 0) {
      await prisma.organizationalUnit.deleteMany({ where: { id: { in: createdChildUnitIds } } });
    }
    const rootUnitIds = createdUnitIds.filter((id) => !createdChildUnitIds.includes(id));
    if (rootUnitIds.length > 0) {
      await prisma.organizationalUnit.deleteMany({ where: { id: { in: rootUnitIds } } });
    }
    await prisma.$disconnect();
  });

  it('keeps a matching critical announcement visible after foreign and lower-priority rows exceed the cap', async () => {
    const result = await announcements.active(viewer, now);
    const ids = result.announcements.map((item) => item.id);

    expect(result.announcements).toHaveLength(50);
    expect(ids[0]).toBe(`${idPrefix}-visible-critical`);
    expect(ids).not.toContain(`${idPrefix}-foreign-active-000`);
    expect(ids).not.toContain(`${idPrefix}-wrong-role`);
    expect(ids).not.toContain(`${idPrefix}-wrong-group`);
    expect(ids).toContain(`${idPrefix}-visible-info-000`);
  });

  it('filters archive audience in PostgreSQL before applying its 100-row cap', async () => {
    const result = await announcements.archive(viewer, now);
    const ids = result.announcements.map((item) => item.id);

    expect(ids).toContain(`${idPrefix}-visible-archive`);
    expect(ids).not.toContain(`${idPrefix}-foreign-archive-000`);
    expect(result.announcements.find((item) => item.id === `${idPrefix}-visible-archive`)?.isActive).toBe(false);
  });
});
