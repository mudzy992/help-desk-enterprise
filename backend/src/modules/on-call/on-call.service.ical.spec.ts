import type { PrismaService } from '../../common/prisma/prisma.service';
import type { SettingsService } from '../settings/settings.service';
import { OnCallService } from './on-call.service';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));
jest.mock('../settings/settings.service', () => ({
  SettingsService: class SettingsService {},
}));
jest.mock('../audit-log/append-audit-log', () => ({ appendAuditLog: jest.fn() }));

const token = 'a'.repeat(40);

function scheduleRow(id: string, groupId: string) {
  return {
    id,
    groupId,
    ownerUserId: null,
    timezone: 'UTC',
    handoffMinute: 8 * 60,
    rotationLength: 'WEEK',
    rotationStartDate: '2026-01-05',
    isActive: true,
    autoAssignOutsideHours: false,
    members: [
      { userId: 'agent-1', position: 0, user: { isActive: true, anonymizedAt: null } },
    ],
  };
}

function createHarness(assignments: readonly Record<string, unknown>[]) {
  const schedules = [scheduleRow('schedule-it', 'group-it'), scheduleRow('schedule-hr', 'group-hr')];
  const prisma = {
    onCallCalendarToken: {
      findUnique: jest.fn(async () => ({
        userId: 'agent-1',
        user: { isActive: true, anonymizedAt: null, preferredLocale: 'bs', userRoles: [{ id: 'role-row-1' }] },
      })),
    },
    user: {
      findUnique: jest.fn(async () => ({
        id: 'agent-1',
        email: 'agent@example.test',
        displayName: 'Agent One',
        isActive: true,
        isLocalOnly: true,
        mustChangePassword: false,
        entraObjectId: null,
        directoryObjectGuid: null,
        authzVersion: 1,
        organizationalUnitId: null,
        userRoles: assignments,
        groupMembers: [{ groupId: 'group-it' }, { groupId: 'group-hr' }],
      })),
    },
    onCallSchedule: { findMany: jest.fn(async () => schedules) },
    onCallOverride: { findMany: jest.fn(async () => []) },
    groupMember: {
      findMany: jest.fn(async () => [
        { groupId: 'group-it', userId: 'agent-1' },
        { groupId: 'group-hr', userId: 'agent-1' },
      ]),
    },
    group: {
      findMany: jest.fn(async () => [
        { id: 'group-it', name: 'IT Group', organizationalUnit: { ouPath: '/root/IT' } },
        { id: 'group-hr', name: 'HR Group', organizationalUnit: { ouPath: '/root/HR' } },
      ]),
    },
  };
  const settings = { getSetting: jest.fn(async () => true) };
  const service = new OnCallService(prisma as unknown as PrismaService, settings as unknown as SettingsService);
  return { service };
}

const assignment = (permissionKeys: readonly string[], organizationalUnit: { id: string; ouPath: string } | null, roleKey = 'AGENT') => ({
  id: `assignment-${roleKey}-${organizationalUnit?.id ?? 'global'}`,
  role: { key: roleKey, rolePermissions: permissionKeys.map((key) => ({ permission: { key } })) },
  organizationalUnit,
  service: null,
});

describe('OnCallService.icalFeed authorization (BA-on-call-07)', () => {
  it('serves all groups for a global oncall.read holder', async () => {
    const { service } = createHarness([assignment(['oncall.read'], null)]);
    const feed = await service.icalFeed(token);
    expect(feed).toContain('IT Group');
    expect(feed).toContain('HR Group');
  });

  it('returns uniform 404 after oncall.read is revoked', async () => {
    const { service } = createHarness([assignment(['tickets.read'], null)]);
    await expect(service.icalFeed(token)).resolves.toBeNull();
  });

  it('drops foreign-group events after an OU scope revoke', async () => {
    const { service } = createHarness([assignment(['oncall.read'], { id: 'ou-it', ouPath: '/root/IT' })]);
    const feed = await service.icalFeed(token);
    expect(feed).toContain('IT Group');
    expect(feed).not.toContain('HR Group');
  });

  it('keeps serving a super admin without explicit assignments', async () => {
    const { service } = createHarness([assignment([], null, 'SUPER_ADMIN')]);
    const feed = await service.icalFeed(token);
    expect(feed).toContain('IT Group');
    expect(feed).toContain('HR Group');
  });
});
