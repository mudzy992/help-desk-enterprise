import { PrismaService } from '../../common/prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { OnCallError, onCallErrorCodes } from './on-call.constants';
import { OnCallService, type SaveOnCallScheduleInput } from './on-call.service';
import type { OnCallViewer } from './on-call-viewer';

jest.mock('../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));
jest.mock('../settings/settings.service', () => ({ SettingsService: class SettingsService {} }));
jest.mock('../audit-log/append-audit-log', () => ({ appendAuditLog: jest.fn() }));

const originalRevision = new Date('2026-10-29T12:00:00.000Z');
const viewer: OnCallViewer = {
  userId: 'manager-1',
  canRead: true,
  canManage: true,
  readScope: { global: true, organizationalUnitPaths: [] },
  manageScope: { global: true, organizationalUnitPaths: [] },
};

type MemberWrite = readonly { readonly scheduleId: string; readonly userId: string; readonly position: number }[];

type HarnessOptions = {
  readonly scheduleExists?: boolean;
  readonly forceCreateConflict?: boolean;
};

function createHarness(options: HarnessOptions = {}) {
  const state: {
    scheduleExists: boolean;
    updatedAt: Date;
    header: { timezone: string; handoffMinute: number } | null;
  } = {
    scheduleExists: options.scheduleExists ?? true,
    updatedAt: new Date(originalRevision.getTime()),
    header: null,
  };
  const memberWrites: MemberWrite[] = [];
  const transaction = {
    onCallSchedule: {
      create: jest.fn(async () => {
        if (options.forceCreateConflict || state.scheduleExists) throw { code: 'P2002' };
        state.scheduleExists = true;
        state.updatedAt = new Date(originalRevision.getTime() + 1);
        return { id: 'schedule-1' };
      }),
      updateMany: jest.fn(async ({ where, data }: {
        readonly where: { readonly groupId: string; readonly updatedAt: Date };
        readonly data: {
          readonly updatedAt: Date;
          readonly timezone: string;
          readonly handoffMinute: number;
        };
      }) => {
        if (!state.scheduleExists || state.updatedAt.getTime() !== where.updatedAt.getTime()) return { count: 0 };
        state.updatedAt = data.updatedAt;
        state.header = { timezone: data.timezone, handoffMinute: data.handoffMinute };
        return { count: 1 };
      }),
      findUnique: jest.fn(async () => (state.scheduleExists ? { id: 'schedule-1' } : null)),
    },
    onCallRotationMember: {
      deleteMany: jest.fn(async () => ({ count: 1 })),
      createMany: jest.fn(async ({ data }: { readonly data: MemberWrite }) => {
        memberWrites.push(data);
        return { count: data.length };
      }),
    },
  };
  const previous = {
    updatedAt: new Date(originalRevision.getTime()),
    members: [{ userId: 'previous-member' }],
  };
  const prisma = {
    group: {
      findUnique: jest.fn(async () => ({
        id: 'group-1',
        name: 'Operations',
        organizationalUnit: { ouPath: '/root/Operations' },
      })),
    },
    onCallSchedule: {
      findUnique: jest.fn(async () => (state.scheduleExists ? previous : null)),
    },
    groupMember: {
      findMany: jest.fn(async () => [
        { user: { id: 'member-a', displayName: 'Ana' } },
        { user: { id: 'member-b', displayName: 'Bojan' } },
      ]),
    },
    $transaction: jest.fn(async (operation: (client: typeof transaction) => Promise<unknown>) => operation(transaction)),
  };
  const settings = { getSetting: jest.fn(async () => true) };
  const service = new OnCallService(prisma as unknown as PrismaService, settings as unknown as SettingsService);
  return { service, prisma, transaction, state, memberWrites };
}

function input(expectedUpdatedAt: string | null, memberUserIds: readonly string[] = ['member-a']): SaveOnCallScheduleInput {
  return {
    expectedUpdatedAt,
    timezone: 'Europe/Sarajevo',
    handoffTime: '09:00',
    rotationLength: 'WEEK',
    rotationStartDate: '2026-10-26',
    isActive: true,
    autoAssignOutsideHours: false,
    ownerUserId: null,
    memberUserIds,
    reason: 'Update the on-call rotation',
  };
}

describe('OnCallService.save optimistic concurrency (BA-on-call-03)', () => {
  it('rejects an update with no revision before opening a write transaction', async () => {
    const { service, prisma } = createHarness();

    await expect(service.save('group-1', input(null), viewer)).rejects.toMatchObject({
      code: onCallErrorCodes.scheduleConflict,
    } satisfies Partial<OnCallError>);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('allows only one concurrent save to replace the header and member set', async () => {
    const { service, transaction, state, memberWrites } = createHarness();
    const revision = originalRevision.toISOString();

    const results = await Promise.allSettled([
      service.save('group-1', input(revision, ['member-a']), viewer),
      service.save('group-1', {
        ...input(revision, ['member-b']),
        timezone: 'America/Chicago',
        handoffTime: '17:00',
      }, viewer),
    ]);
    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({
      reason: { code: onCallErrorCodes.scheduleConflict },
    });
    expect(transaction.onCallSchedule.updateMany).toHaveBeenCalledTimes(2);
    expect(transaction.onCallRotationMember.deleteMany).toHaveBeenCalledTimes(1);
    expect(memberWrites).toHaveLength(1);
    const winningMember = memberWrites[0]?.[0]?.userId;
    expect([['member-a'], ['member-b']]).toContainEqual(memberWrites[0]?.map((member) => member.userId));
    if (winningMember === 'member-a') {
      expect(state.header).toEqual({ timezone: 'Europe/Sarajevo', handoffMinute: 540 });
    } else {
      expect(winningMember).toBe('member-b');
      expect(state.header).toEqual({ timezone: 'America/Chicago', handoffMinute: 1020 });
    }
    expect(state.updatedAt.getTime()).toBeGreaterThan(originalRevision.getTime());
  });

  it('maps a concurrent first-create unique-key race to the same conflict', async () => {
    const { service, transaction } = createHarness({ scheduleExists: false, forceCreateConflict: true });

    await expect(service.save('group-1', input(null), viewer)).rejects.toMatchObject({
      code: onCallErrorCodes.scheduleConflict,
    });
    expect(transaction.onCallSchedule.create).toHaveBeenCalledTimes(1);
    expect(transaction.onCallRotationMember.deleteMany).not.toHaveBeenCalled();
  });
});
