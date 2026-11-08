import { PrismaService } from '../../common/prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { OnCallError, onCallErrorCodes } from './on-call.constants';
import type { OnCallViewer } from './on-call-viewer';
import { OnCallService } from './on-call.service';

jest.mock('../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));
jest.mock('../settings/settings.service', () => ({ SettingsService: class SettingsService {} }));
jest.mock('../audit-log/append-audit-log', () => ({ appendAuditLog: jest.fn() }));

type ScheduleMember = {
  readonly userId: string;
  readonly position: number;
  readonly user: { readonly isActive: boolean; readonly anonymizedAt: Date | null };
};

type ScheduleRow = {
  readonly id: string;
  readonly groupId: string;
  readonly ownerUserId: null;
  readonly timezone: string;
  readonly handoffMinute: number;
  readonly rotationLength: 'WEEK';
  readonly rotationStartDate: string;
  readonly isActive: boolean;
  readonly autoAssignOutsideHours: false;
  readonly members: readonly ScheduleMember[];
};

type SwapRange = { readonly startsAt: Date; readonly endsAt: Date };
type OverrideQuery = {
  readonly where: {
    readonly scheduleId: { readonly in: readonly string[] };
    readonly startsAt: { readonly lt: Date };
    readonly endsAt: { readonly gt: Date };
  };
};
type HarnessOptions = {
  readonly isActive?: boolean;
  readonly requesterIsActive?: boolean;
  readonly overrides?: readonly {
    readonly id: string;
    readonly scheduleId: string;
    readonly userId: string;
    readonly startsAt: Date;
    readonly endsAt: Date;
  }[];
};

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

function rangeFromShiftStart(shiftStart: Date, startsAfterHours: number, endsAfterHours: number): SwapRange {
  return {
    startsAt: new Date(shiftStart.getTime() + startsAfterHours * 60 * 60 * 1000),
    endsAt: new Date(shiftStart.getTime() + endsAfterHours * 60 * 60 * 1000),
  };
}

function createHarness(shiftStart: Date, options: HarnessOptions = {}) {
  const schedule: ScheduleRow = {
    id: 'schedule-it',
    groupId: 'group-it',
    ownerUserId: null,
    timezone: 'UTC',
    handoffMinute: 8 * 60,
    rotationLength: 'WEEK',
    rotationStartDate: shiftStart.toISOString().slice(0, 10),
    isActive: options.isActive ?? true,
    autoAssignOutsideHours: false,
    members: [
      { userId: 'requester', position: 0, user: { isActive: options.requesterIsActive ?? true, anonymizedAt: null } },
      { userId: 'colleague', position: 1, user: { isActive: true, anonymizedAt: null } },
      { userId: 'third-person', position: 2, user: { isActive: true, anonymizedAt: null } },
    ],
  };
  const findOverrides = jest.fn(async ({ where }: OverrideQuery) =>
    (options.overrides ?? []).filter(
      (override) =>
        where.scheduleId.in.includes(override.scheduleId) &&
        override.startsAt < where.startsAt.lt &&
        override.endsAt > where.endsAt.gt,
    ),
  );
  const createSwap = jest.fn(async () => ({ id: 'swap-1' }));
  const transaction = { onCallSwapRequest: { create: createSwap } };
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
    onCallOverride: { findMany: findOverrides },
    onCallSwapRequest: { create: createSwap },
    user: {
      findMany: jest.fn(async () => [{
        id: 'requester',
        displayName: 'Requester',
        isActive: true,
        anonymizedAt: null,
      }]),
    },
    $transaction: transactionRunner,
  };
  const settings = { getSetting: jest.fn(async () => true) };
  const service = new OnCallService(prisma as unknown as PrismaService, settings as unknown as SettingsService);
  const notify = jest.spyOn(service, 'notify').mockResolvedValue(true);
  return { service, prisma, createSwap, transactionRunner, notify, findOverrides };
}

function swapInput(range: SwapRange) {
  return {
    colleagueId: 'colleague',
    startsAt: range.startsAt.toISOString(),
    endsAt: range.endsAt.toISOString(),
    reason: 'shift coverage',
  };
}

async function expectSwapRejected(
  shiftStart: Date,
  range: SwapRange,
  options: HarnessOptions = {},
): Promise<void> {
  const { service, createSwap, transactionRunner } = createHarness(shiftStart, options);

  await expect(service.requestSwap('group-it', swapInput(range), viewer)).rejects.toMatchObject({
    code: onCallErrorCodes.swapNotAllowed,
  } satisfies Partial<OnCallError>);
  expect(createSwap).not.toHaveBeenCalled();
  expect(transactionRunner).not.toHaveBeenCalled();
}

describe('OnCallService swap interval validation (BA-on-call-02)', () => {
  const acceptedRanges: readonly [string, number, number][] = [
    ['a partial period', 2, 3],
    ['the complete rotation shift', 0, 7 * 24],
  ];

  it.each(acceptedRanges)('allows a request covering %s inside the requester shift', async (_description, startsAfter, endsAfter) => {
    const shiftStart = nextMondayHandoff();
    const range = rangeFromShiftStart(shiftStart, startsAfter, endsAfter);
    const { service, createSwap, notify } = createHarness(shiftStart);

    await expect(service.requestSwap('group-it', swapInput(range), viewer)).resolves.toEqual({ id: 'swap-1' });
    expect(createSwap).toHaveBeenCalledWith({
      data: {
        scheduleId: 'schedule-it',
        requesterId: 'requester',
        colleagueId: 'colleague',
        startsAt: range.startsAt,
        endsAt: range.endsAt,
        reason: 'shift coverage',
      },
      select: { id: true },
    });
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('rejects a range belonging to a later colleague shift instead of overriding that colleague', async () => {
    const shiftStart = nextMondayHandoff();

    await expectSwapRejected(shiftStart, rangeFromShiftStart(shiftStart, 14 * 24 + 1, 14 * 24 + 2));
  });

  it('rejects a request that crosses the handoff into another rotation member shift', async () => {
    const shiftStart = nextMondayHandoff();

    await expectSwapRejected(shiftStart, rangeFromShiftStart(shiftStart, 7 * 24 - 1, 7 * 24 + 1));
  });

  it('rejects time before the requester rotation starts', async () => {
    const shiftStart = nextMondayHandoff();
    const range = { startsAt: new Date(shiftStart.getTime() - 60 * 60 * 1000), endsAt: shiftStart };

    await expectSwapRejected(shiftStart, range);
  });

  it('rejects an inactive or unavailable requester schedule segment', async () => {
    const shiftStart = nextMondayHandoff();
    const range = rangeFromShiftStart(shiftStart, 1, 2);

    await expectSwapRejected(shiftStart, range, { isActive: false });
    await expectSwapRejected(shiftStart, range, { requesterIsActive: false });
  });

  it('rejects a period occupied by an existing override, even when it overlaps the requester rotation', async () => {
    const shiftStart = nextMondayHandoff();
    const range = rangeFromShiftStart(shiftStart, 1, 2);
    const { service, createSwap, transactionRunner, findOverrides } = createHarness(shiftStart, {
      overrides: [{
        id: 'override-third',
        scheduleId: 'schedule-it',
        userId: 'third-person',
        startsAt: new Date(shiftStart.getTime() + 90 * 60 * 1000),
        endsAt: new Date(shiftStart.getTime() + 150 * 60 * 1000),
      }],
    });

    await expect(service.requestSwap('group-it', swapInput(range), viewer)).rejects.toMatchObject({
      code: onCallErrorCodes.swapNotAllowed,
    } satisfies Partial<OnCallError>);
    expect(findOverrides).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        scheduleId: { in: ['schedule-it'] },
        startsAt: { lt: range.endsAt },
        endsAt: { gt: range.startsAt },
      }),
    }));
    expect(createSwap).not.toHaveBeenCalled();
    expect(transactionRunner).not.toHaveBeenCalled();
  });
});
