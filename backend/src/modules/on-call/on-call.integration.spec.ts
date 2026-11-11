import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { auditLogActions } from '../audit-log/audit-log.constants';
import type { SettingsService } from '../settings/settings.service';
import { onCallErrorCodes } from './on-call.constants';
import type { OnCallViewer } from './on-call-viewer';
import { OnCallService } from './on-call.service';

/**
 * BA-on-call-14: PostgreSQL integration matrix for the paths unit mocks
 * cannot prove — real SERIALIZABLE dedupe under concurrency, the schedule
 * save CAS race, and iCal token/permission revocation against real rows.
 */
const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;
const stamp = `${Date.now()}-${process.pid}`;

const ids = {
  ou: `oncall-it-ou-${stamp}`,
  group: `oncall-it-group-${stamp}`,
  manager: `oncall-it-manager-${stamp}`,
  requester: `oncall-it-requester-${stamp}`,
  colleague: `oncall-it-colleague-${stamp}`,
  role: `oncall-it-role-${stamp}`,
  readPermission: `oncall-it-perm-read-${stamp}`,
  managePermission: `oncall-it-perm-manage-${stamp}`,
};

function nextMonday(): Date {
  const day = new Date();
  day.setUTCHours(8, 0, 0, 0);
  const daysUntilMonday = (8 - day.getUTCDay()) % 7 || 7;
  day.setUTCDate(day.getUTCDate() + daysUntilMonday);
  return day;
}

const viewerFor = (userId: string, canManage: boolean): OnCallViewer => ({
  userId,
  canRead: true,
  canManage,
  readScope: { global: true, organizationalUnitPaths: [] },
  manageScope: canManage
    ? { global: true, organizationalUnitPaths: [] }
    : { global: false, organizationalUnitPaths: [] },
});

describeIfDatabase('on-call PostgreSQL integration matrix (BA-on-call-14)', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient;
  let service: OnCallService;
  let scheduleStart: Date;
  let rolePermissionReadId: string;
  let rolePermissionManageId: string;

  const swapInput = (startsAfterHours: number, endsAfterHours: number) => ({
    colleagueId: ids.colleague,
    startsAt: new Date(scheduleStart.getTime() + startsAfterHours * 3_600_000).toISOString(),
    endsAt: new Date(scheduleStart.getTime() + endsAfterHours * 3_600_000).toISOString(),
    reason: 'integration coverage',
  });

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    scheduleStart = nextMonday();

    await prisma.organizationalUnit.create({
      data: { id: ids.ou, name: `OnCall IT ${stamp}`, type: 'DIRECTORATE', distinguishedName: `OU=OnCall-IT-${stamp}`, ouPath: `/oncall-it-${stamp}` },
    });
    const role = await prisma.role.upsert({
      where: { key: 'AGENT' },
      update: {},
      create: { id: ids.role, key: 'AGENT', name: 'Agent (on-call IT)' },
    });
    ids.role = role.id;
    const readPermission = await prisma.permission.upsert({
      where: { key: 'oncall.read' },
      update: {},
      create: { id: ids.readPermission, key: 'oncall.read', description: 'on-call read (IT)' },
    });
    const managePermission = await prisma.permission.upsert({
      where: { key: 'oncall.manage' },
      update: {},
      create: { id: ids.managePermission, key: 'oncall.manage', description: 'on-call manage (IT)' },
    });
    ids.readPermission = readPermission.id;
    ids.managePermission = managePermission.id;
    const readLink = await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: ids.role, permissionId: ids.readPermission } },
      update: {},
      create: { roleId: ids.role, permissionId: ids.readPermission },
    });
    rolePermissionReadId = readLink.id;
    const manageLink = await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: ids.role, permissionId: ids.managePermission } },
      update: {},
      create: { roleId: ids.role, permissionId: ids.managePermission },
    });
    rolePermissionManageId = manageLink.id;

    for (const [id, displayName] of [
      [ids.manager, 'OnCall Manager'],
      [ids.requester, 'OnCall Requester'],
      [ids.colleague, 'OnCall Colleague'],
    ] as const) {
      await prisma.user.create({
        data: { id, email: `${id}@example.test`, displayName, isActive: true },
      });
      await prisma.userRole.create({ data: { userId: id, roleId: ids.role } });
    }

    await prisma.group.create({
      data: { id: ids.group, name: `OnCall IT Group ${stamp}`, key: `oncall-it-${stamp}`, organizationalUnitId: ids.ou },
    });
    await prisma.groupMember.createMany({
      data: [
        { groupId: ids.group, userId: ids.requester },
        { groupId: ids.group, userId: ids.colleague },
      ],
    });
    await prisma.onCallSchedule.create({
      data: {
        groupId: ids.group,
        timezone: 'UTC',
        handoffMinute: 480,
        rotationLength: 'WEEK',
        rotationStartDate: scheduleStart.toISOString().slice(0, 10),
        isActive: true,
        ownerUserId: ids.manager,
        members: {
          create: [
            { userId: ids.requester, position: 0 },
            { userId: ids.colleague, position: 1 },
          ],
        },
      },
    });

    const settings = { getSetting: jest.fn(async () => true) };
    service = new OnCallService(
      prisma as unknown as PrismaService,
      settings as unknown as SettingsService,
    );
    jest.spyOn(service, 'notify').mockResolvedValue(true);
  });

  afterAll(async () => {
    await prisma.onCallSwapRequest.deleteMany({ where: { schedule: { groupId: ids.group } } });
    await prisma.onCallCalendarToken.deleteMany({ where: { userId: { in: [ids.requester, ids.colleague, ids.manager] } } });
    await prisma.onCallSchedule.deleteMany({ where: { groupId: ids.group } });
    await prisma.groupMember.deleteMany({ where: { groupId: ids.group } });
    await prisma.group.deleteMany({ where: { id: ids.group } });
    await prisma.auditLog.deleteMany({ where: { actorUserId: { in: [ids.requester, ids.colleague, ids.manager] } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: [ids.requester, ids.colleague, ids.manager] } } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.requester, ids.colleague, ids.manager] } } });
    await prisma.rolePermission.deleteMany({ where: { roleId: ids.role } });
    await prisma.role.deleteMany({ where: { id: ids.role } });
    await prisma.permission.deleteMany({ where: { id: { in: [ids.readPermission, ids.managePermission] } } });
    await prisma.organizationalUnit.deleteMany({ where: { id: ids.ou } });
    await prisma.$disconnect();
  });

  it('rejects a sequential identical pending swap and keeps exactly one row', async () => {
    const viewer = viewerFor(ids.requester, false);
    await expect(service.requestSwap(ids.group, swapInput(2, 3), viewer)).resolves.toEqual({ id: expect.any(String) });
    await expect(service.requestSwap(ids.group, swapInput(2, 3), viewer)).rejects.toMatchObject({
      code: onCallErrorCodes.swapDuplicate,
    });
    const count = await prisma.onCallSwapRequest.count({
      where: { schedule: { groupId: ids.group }, requesterId: ids.requester, status: 'PENDING' },
    });
    expect(count).toBe(1);
  });

  it('lets exactly one of two concurrent identical swaps win', async () => {
    const viewer = viewerFor(ids.requester, false);
    const outcomes = await Promise.allSettled([
      service.requestSwap(ids.group, swapInput(5, 6), viewer),
      service.requestSwap(ids.group, swapInput(5, 6), viewer),
    ]);
    expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter(({ status }) => status === 'rejected')).toHaveLength(1);
    const rows = await prisma.onCallSwapRequest.findMany({
      where: { schedule: { groupId: ids.group }, requesterId: ids.requester, status: 'PENDING', startsAt: new Date(swapInput(5, 6).startsAt) },
      select: { id: true },
    });
    expect(rows).toHaveLength(1);
  });

  it('lets exactly one of two concurrent schedule saves win the CAS race', async () => {
    const current = await prisma.onCallSchedule.findUniqueOrThrow({
      where: { groupId: ids.group },
      select: { updatedAt: true },
    });
    const saveInput = (handoffTime: string) => ({
      expectedUpdatedAt: current.updatedAt.toISOString(),
      timezone: 'UTC',
      handoffTime,
      rotationLength: 'WEEK' as const,
      rotationStartDate: scheduleStart.toISOString().slice(0, 10),
      isActive: true,
      autoAssignOutsideHours: false,
      ownerUserId: null,
      memberUserIds: [ids.requester, ids.colleague],
      reason: 'integration race',
    });
    const manager = viewerFor(ids.manager, true);
    const outcomes = await Promise.allSettled([
      service.save(ids.group, saveInput('08:00'), manager),
      service.save(ids.group, saveInput('09:00'), manager),
    ]);
    expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter(({ status }) => status === 'rejected')).toEqual([
      expect.objectContaining({ reason: expect.objectContaining({ code: onCallErrorCodes.scheduleConflict }) }),
    ]);
  });

  it('serves the feed, then a token revoke removes access and leaves an audit row', async () => {
    const viewer = viewerFor(ids.requester, false);
    const { token } = await service.rotateCalendarToken(viewer);
    const feed = await service.icalFeed(token);
    expect(feed).toContain('OnCall IT Group');

    await service.revokeCalendarToken(viewer);
    expect(
      await prisma.onCallCalendarToken.findUnique({ where: { userId: ids.requester } }),
    ).toBeNull();
    const audit = await prisma.auditLog.findFirst({
      where: { actorUserId: ids.requester, action: auditLogActions.onCallCalendarTokenRevoked },
      select: { id: true },
    });
    expect(audit).not.toBeNull();
    await expect(service.icalFeed(token)).resolves.toBeNull();
  });

  it('serves no feed content after the oncall.read permission is revoked', async () => {
    const viewer = viewerFor(ids.requester, false);
    const { token } = await service.rotateCalendarToken(viewer);
    await expect(service.icalFeed(token)).resolves.toContain('OnCall IT Group');
    // Full revocation: oncall.manage also confers read access, so both
    // grants must go before the feed may serve nothing (BA-on-call-07).
    await prisma.rolePermission.deleteMany({ where: { id: { in: [rolePermissionReadId, rolePermissionManageId] } } });
    try {
      await expect(service.icalFeed(token)).resolves.toBeNull();
    } finally {
      await prisma.rolePermission.createMany({
        data: [
          { id: rolePermissionReadId, roleId: ids.role, permissionId: ids.readPermission },
          { id: rolePermissionManageId, roleId: ids.role, permissionId: ids.managePermission },
        ],
      });
    }
  });
});
