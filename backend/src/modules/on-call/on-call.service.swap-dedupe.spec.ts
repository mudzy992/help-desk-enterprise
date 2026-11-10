import { PrismaService } from '../../common/prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { onCallErrorCodes, onCallLimits } from './on-call.constants';
import type { OnCallViewer } from './on-call-viewer';
import { OnCallService } from './on-call.service';

jest.mock('../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));
jest.mock('../settings/settings.service', () => ({ SettingsService: class SettingsService {} }));
jest.mock('../audit-log/append-audit-log', () => ({ appendAuditLog: jest.fn() }));

const viewer: OnCallViewer = {
  userId: 'requester',
  canRead: true,
  canManage: false,
  readScope: { global: true, organizationalUnitPaths: [] },
  manageScope: { global: false, organizationalUnitPaths: [] },
};

function nextMondayHandoff(): Date {
  const startsAt = new Date();
  startsAt.setUTCHours(8, 0, 0, 0);
  const daysUntilMonday = (8 - startsAt.getUTCDay()) % 7 || 7;
  startsAt.setUTCDate(startsAt.getUTCDate() + daysUntilMonday);
  return startsAt;
}

function createHarness(options: { duplicate?: boolean; pendingCount?: number } = {}) {
  const shiftStart = nextMondayHandoff();
  const schedule = {
    id: 'schedule-it',
    groupId: 'group-it',
    ownerUserId: null,
    timezone: 'UTC',
    handoffMinute: 8 * 60,
    rotationLength: 'WEEK',
    rotationStartDate: shiftStart.toISOString().slice(0, 10),
    isActive: true,
    autoAssignOutsideHours: false,
    members: [
      { userId: 'requester', position: 0, user: { isActive: true, anonymizedAt: null } },
      { userId: 'colleague', position: 1, user: { isActive: true, anonymizedAt: null } },
    ],
  };
  const createSwap = jest.fn(async () => ({ id: 'swap-1' }));
  const findFirst = jest.fn(async () => (options.duplicate ? { id: 'swap-existing' } : null));
  const count = jest.fn(async () => options.pendingCount ?? 0);
  const transaction = { onCallSwapRequest: { create: createSwap, findFirst, count } };
  const transactionRunner = jest.fn(
    async (operation: (client: unknown) => Promise<unknown>): Promise<unknown> => operation(transaction),
  );
  const prisma = {
    group: {
      findUnique: jest.fn(async () => ({
        id: 'group-it',
        name: 'IT Support',
        organizationalUnit: { ouPath: '/root/IT' },
      })),
    },
    onCallSchedule: { findUnique: jest.fn(async () => schedule) },
    groupMember: {
      findMany: jest.fn(async () => schedule.members.map((member) => ({ groupId: 'group-it', userId: member.userId }))),
    },
    onCallOverride: { findMany: jest.fn(async () => []) },
    user: {
      findMany: jest.fn(async () => [
        { id: 'requester', displayName: 'Requester', isActive: true, anonymizedAt: null },
      ]),
    },
    $transaction: transactionRunner,
  };
  const settings = { getSetting: jest.fn(async () => true) };
  const service = new OnCallService(prisma as unknown as PrismaService, settings as unknown as SettingsService);
  const notify = jest.spyOn(service, 'notify').mockResolvedValue(true);
  const range = {
    startsAt: new Date(shiftStart.getTime() + 2 * 60 * 60 * 1000),
    endsAt: new Date(shiftStart.getTime() + 3 * 60 * 60 * 1000),
  };
  const input = {
    colleagueId: 'colleague',
    startsAt: range.startsAt.toISOString(),
    endsAt: range.endsAt.toISOString(),
    reason: 'shift coverage',
  };
  return { service, createSwap, findFirst, count, transactionRunner, notify, input };
}

describe('OnCallService swap dedupe and pending cap (BA-on-call-13)', () => {
  it('rejects an identical pending request without creating or notifying', async () => {
    const harness = createHarness({ duplicate: true });
    await expect(harness.service.requestSwap('group-it', harness.input, viewer)).rejects.toMatchObject({
      code: onCallErrorCodes.swapDuplicate,
    });
    expect(harness.createSwap).not.toHaveBeenCalled();
    expect(harness.notify).not.toHaveBeenCalled();
  });

  it('checks the duplicate with the exact schedule, pair and range', async () => {
    const harness = createHarness({ duplicate: true });
    await expect(harness.service.requestSwap('group-it', harness.input, viewer)).rejects.toMatchObject({
      code: onCallErrorCodes.swapDuplicate,
    });
    expect(harness.findFirst).toHaveBeenCalledWith({
      where: {
        scheduleId: 'schedule-it',
        requesterId: 'requester',
        colleagueId: 'colleague',
        startsAt: new Date(harness.input.startsAt),
        endsAt: new Date(harness.input.endsAt),
        status: 'PENDING',
      },
      select: { id: true },
    });
  });

  it('rejects when the requester already has the maximum pending requests', async () => {
    const harness = createHarness({ pendingCount: onCallLimits.maxPendingSwapRequests });
    await expect(harness.service.requestSwap('group-it', harness.input, viewer)).rejects.toMatchObject({
      code: onCallErrorCodes.swapLimitReached,
    });
    expect(harness.createSwap).not.toHaveBeenCalled();
    expect(harness.notify).not.toHaveBeenCalled();
  });

  it('creates a non-duplicate request below the cap inside a SERIALIZABLE transaction', async () => {
    const harness = createHarness({ pendingCount: 3 });
    await expect(harness.service.requestSwap('group-it', harness.input, viewer)).resolves.toEqual({ id: 'swap-1' });
    expect(harness.createSwap).toHaveBeenCalledTimes(1);
    expect(harness.transactionRunner).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
    expect(harness.notify).toHaveBeenCalledTimes(1);
  });
});
