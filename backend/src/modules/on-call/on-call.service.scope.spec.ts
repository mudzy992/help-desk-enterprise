import { PrismaService } from '../../common/prisma/prisma.service';
import type { PrincipalContext } from '../../common/principal-context/principal-context.types';
import { SettingsService } from '../settings/settings.service';
import { permissionKeys } from '../authorization/authorization.constants';
import { onCallErrorCodes } from './on-call.constants';
import { OnCallService, type SaveOnCallScheduleInput } from './on-call.service';
import { onCallViewerFromContext } from './on-call-viewer';

jest.mock('../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));
jest.mock('../settings/settings.service', () => ({ SettingsService: class SettingsService {} }));

type PrismaHarnessOptions = {
  readonly groups?: readonly unknown[];
  readonly group?: unknown;
  readonly override?: unknown;
  readonly swap?: unknown;
  readonly schedules?: readonly unknown[];
  readonly swaps?: readonly unknown[];
};

function createHarness(options: PrismaHarnessOptions = {}) {
  const prisma = {
    group: {
      findMany: jest.fn(async () => [...(options.groups ?? [])]),
      findUnique: jest.fn(async () => options.group ?? null),
    },
    onCallSchedule: {
      findMany: jest.fn<Promise<unknown[]>, [{ where?: Record<string, unknown> }]>(async (query) => {
        if (query.where?.isActive === true) return [];
        return [...(options.schedules ?? [])];
      }),
      findUnique: jest.fn(async () => null),
    },
    onCallOverride: {
      findMany: jest.fn(async () => []),
      findUnique: jest.fn(async () => options.override ?? null),
    },
    onCallSwapRequest: {
      findMany: jest.fn(async () => [...(options.swaps ?? [])]),
      findUnique: jest.fn(async () => options.swap ?? null),
    },
    groupMember: { findMany: jest.fn(async () => []) },
    user: { findMany: jest.fn(async () => []) },
    $transaction: jest.fn(async (): Promise<never> => {
      throw new Error('Unexpected transaction in scoped group access test');
    }),
  };
  const settings = { getSetting: jest.fn(async () => true) };
  const service = new OnCallService(prisma as unknown as PrismaService, settings as unknown as SettingsService);
  return { service, prisma };
}

function scopedViewer(permission: string) {
  const context = {
    subjectId: 'actor-1',
    roleKeys: ['ADMIN'],
    assignments: [{
      roleKey: 'ADMIN',
      permissionKeys: [permission],
      organizationalUnitId: 'ou-it',
      organizationalUnitPath: '/root/IT',
      serviceId: null,
    }],
  } as unknown as PrincipalContext;
  return onCallViewerFromContext(context, 'actor-1');
}

function group(id: string, name: string, ouPath: string) {
  return { id, name, organizationalUnit: { ouPath } };
}

const scheduleInput = {
  timezone: 'UTC',
  handoffTime: '08:00',
  rotationLength: 'WEEK',
  rotationStartDate: '2026-01-05',
  isActive: true,
  autoAssignOutsideHours: false,
  ownerUserId: null,
  memberUserIds: [],
  reason: 'scope check',
} as SaveOnCallScheduleInput;

const scopedWriteCases: readonly [
  string,
  (service: OnCallService, viewer: ReturnType<typeof scopedViewer>) => Promise<unknown>,
][] = [
  ['save', (service, viewer) => service.save('hr', scheduleInput, viewer)],
  ['remove', (service, viewer) => service.remove('hr', 'scope check', viewer)],
  ['create override', (service, viewer) => service.createOverride('hr', {
    userId: 'staff-1',
    startsAt: '2027-01-01T08:00:00.000Z',
    endsAt: '2027-01-01T09:00:00.000Z',
    reason: 'scope check',
  }, viewer)],
];

describe('OnCallService scoped group access (BA-on-call-01)', () => {
  it('filters overview groups and schedule/context queries to the reader OU subtree', async () => {
    const { service, prisma } = createHarness({
      groups: [
        group('it', 'IT Support', '/root/IT'),
        group('it-child', 'IT Network', '/root/IT/Network'),
        group('hr', 'Human Resources', '/root/HR'),
      ],
      schedules: [{ groupId: 'it', isActive: true, timezone: 'UTC' }],
    });

    const result = await service.overview(scopedViewer(permissionKeys.onCallRead));

    expect(result).toMatchObject({ canManage: false });
    expect(result.groups.map((entry: { groupId: string }) => entry.groupId)).toEqual(['it']);
    const scheduleQueries = prisma.onCallSchedule.findMany.mock.calls.map(([query]) => query.where);
    expect(scheduleQueries).toEqual(expect.arrayContaining([
      { groupId: { in: ['it', 'it-child'] } },
      { isActive: true, groupId: { in: ['it', 'it-child'] } },
    ]));
  });

  it('hides a foreign direct-ID detail before reading its schedule', async () => {
    const { service, prisma } = createHarness({ group: group('hr', 'Human Resources', '/root/HR') });

    await expect(service.detail('hr', {}, scopedViewer(permissionKeys.onCallRead))).rejects.toMatchObject({
      code: onCallErrorCodes.groupNotFound,
    });
    expect(prisma.onCallSchedule.findUnique).not.toHaveBeenCalled();
  });

  it('limits the personal-shift lookup to groups in the reader OU subtree', async () => {
    const { service, prisma } = createHarness({
      groups: [group('it', 'IT Support', '/root/IT'), group('hr', 'Human Resources', '/root/HR')],
    });

    await expect(service.me(scopedViewer(permissionKeys.onCallRead))).resolves.toMatchObject({
      enabled: true,
      current: [],
      next: null,
    });
    expect(prisma.onCallSchedule.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ isActive: true, groupId: { in: ['it'] } }),
    }));
  });

  it.each(scopedWriteCases)('rejects out-of-scope group writes (%s) before touching the schedule', async (_name, operation) => {
    const { service, prisma } = createHarness({ group: group('hr', 'Human Resources', '/root/HR') });

    await expect(operation(service, scopedViewer(permissionKeys.onCallManage))).rejects.toMatchObject({
      code: onCallErrorCodes.groupNotFound,
    });
    expect(prisma.onCallSchedule.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a direct override-ID delete outside the manager OU before starting a transaction', async () => {
    const { service, prisma } = createHarness({
      override: {
        id: 'override-1',
        scheduleId: 'schedule-hr',
        userId: 'staff-2',
        startsAt: new Date('2027-01-01T08:00:00.000Z'),
        endsAt: new Date('2027-01-01T09:00:00.000Z'),
        schedule: { group: { organizationalUnit: { ouPath: '/root/HR' } } },
      },
    });

    await expect(service.deleteOverride('override-1', 'scope check', scopedViewer(permissionKeys.onCallManage)))
      .rejects.toMatchObject({ code: onCallErrorCodes.overrideNotFound });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not expose or create a swap for an out-of-scope group', async () => {
    const { service, prisma } = createHarness({ group: group('hr', 'Human Resources', '/root/HR') });

    await expect(service.requestSwap('hr', {
      colleagueId: 'staff-2',
      startsAt: '2027-01-01T08:00:00.000Z',
      endsAt: '2027-01-01T09:00:00.000Z',
      reason: 'scope check',
    }, scopedViewer(permissionKeys.onCallRead))).rejects.toMatchObject({
      code: onCallErrorCodes.groupNotFound,
    });
    expect(prisma.onCallSchedule.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each(['accept', 'decline'] as const)('hides a foreign direct swap-ID %s request', async (decision) => {
    const { service, prisma } = createHarness({
      swap: {
        id: 'swap-hr',
        scheduleId: 'schedule-hr',
        requesterId: 'staff-2',
        colleagueId: 'actor-1',
        startsAt: new Date('2027-01-01T08:00:00.000Z'),
        endsAt: new Date('2027-01-01T09:00:00.000Z'),
        reason: 'scope check',
        status: 'PENDING',
        schedule: { timezone: 'UTC', group: { name: 'Human Resources', organizationalUnit: { ouPath: '/root/HR' } } },
      },
    });

    await expect(service.decideSwap('swap-hr', decision, scopedViewer(permissionKeys.onCallRead)))
      .rejects.toMatchObject({ code: onCallErrorCodes.swapNotFound });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('hides a foreign direct swap-ID cancellation from a scoped manager', async () => {
    const { service, prisma } = createHarness({
      swap: {
        id: 'swap-hr',
        scheduleId: 'schedule-hr',
        requesterId: 'staff-2',
        status: 'PENDING',
        schedule: { group: { organizationalUnit: { ouPath: '/root/HR' } } },
      },
    });

    await expect(service.cancelSwap('swap-hr', scopedViewer(permissionKeys.onCallManage)))
      .rejects.toMatchObject({ code: onCallErrorCodes.swapNotFound });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('limits the personal swap-history query to schedules in the reader OU', async () => {
    const { service, prisma } = createHarness({
      groups: [group('it', 'IT Support', '/root/IT'), group('hr', 'Human Resources', '/root/HR')],
      schedules: [{ id: 'schedule-it' }],
    });

    await expect(service.mySwaps(scopedViewer(permissionKeys.onCallRead))).resolves.toEqual([]);
    expect(prisma.onCallSwapRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ scheduleId: { in: ['schedule-it'] } }),
    }));
  });
});
