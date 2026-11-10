import type { PrismaService } from '../../common/prisma/prisma.service';
import type { SettingsService } from '../settings/settings.service';
import { OnCallService } from './on-call.service';
import { onCallErrorCodes } from './on-call.constants';
import type { OnCallViewer } from './on-call-viewer';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));
jest.mock('../settings/settings.service', () => ({
  SettingsService: class SettingsService {},
}));
jest.mock('../audit-log/append-audit-log', () => ({
  // Validate metadata against the real audit policy, then no-op the write:
  // a blind mock hid the onCallOverrideCreated allowlist break for years.
  appendAuditLog: jest.fn(async (_client: unknown, input: unknown) => {
    const { prepareAuditEntry } = jest.requireActual('../audit-log/audit-event-policy') as typeof import('../audit-log/audit-event-policy');
    prepareAuditEntry(input as never);
  }),
}));

type MemberRow = {
  readonly userId: string;
  readonly position: number;
  readonly user: { readonly isActive: boolean; readonly anonymizedAt: Date | null };
};

const colleagueViewer: OnCallViewer = {
  userId: 'colleague',
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

function createHarness(acceptMembers: readonly MemberRow[]) {
  const shiftStart = nextMondayHandoff();
  const requestMembers: readonly MemberRow[] = [
    { userId: 'requester', position: 0, user: { isActive: true, anonymizedAt: null } },
    { userId: 'colleague', position: 1, user: { isActive: true, anonymizedAt: null } },
  ];
  const scheduleAtAccept = {
    id: 'schedule-it',
    groupId: 'group-it',
    ownerUserId: null,
    timezone: 'UTC',
    handoffMinute: 8 * 60,
    rotationLength: 'WEEK',
    rotationStartDate: shiftStart.toISOString().slice(0, 10),
    isActive: true,
    autoAssignOutsideHours: false,
    members: acceptMembers,
  };
  const swap = {
    id: 'swap-1',
    scheduleId: 'schedule-it',
    requesterId: 'requester',
    colleagueId: 'colleague',
    startsAt: new Date(shiftStart.getTime() + 60 * 60 * 1000),
    endsAt: new Date(shiftStart.getTime() + 3 * 60 * 60 * 1000),
    reason: 'shift coverage',
    status: 'PENDING',
    schedule: {
      groupId: 'group-it',
      timezone: 'UTC',
      group: { name: 'IT Support', organizationalUnit: { ouPath: '/root/IT' } },
    },
  };
  const createOverride = jest.fn(async () => ({ id: 'override-1' }));
  const updateSwap = jest.fn(async () => ({ count: 1 }));
  const transaction = {
    onCallSchedule: { findUnique: jest.fn(async () => scheduleAtAccept) },
    groupMember: {
      findMany: jest.fn(async () =>
        acceptMembers.map((member) => ({ groupId: 'group-it', userId: member.userId })),
      ),
    },
    onCallOverride: { findMany: jest.fn(async () => []), create: createOverride },
    onCallSwapRequest: { updateMany: updateSwap },
    auditLog: { create: jest.fn(async () => ({})) },
  };
  const prisma = {
    onCallSwapRequest: { findUnique: jest.fn(async () => swap) },
    user: {
      findMany: jest.fn(async () => [
        { id: 'colleague', displayName: 'Colleague', isActive: true, anonymizedAt: null },
      ]),
    },
    $transaction: jest.fn(async (operation: (client: unknown) => Promise<unknown>) => operation(transaction)),
  };
  const settings = { getSetting: jest.fn(async () => true) };
  const service = new OnCallService(prisma as unknown as PrismaService, settings as unknown as SettingsService);
  jest.spyOn(service, 'notify').mockResolvedValue(true);
  return { service, createOverride, updateSwap, requestMembers };
}

const active = (userId: string, position: number): MemberRow => ({
  userId,
  position,
  user: { isActive: true, anonymizedAt: null },
});

describe('OnCallService swap accept revalidation (BA-on-call-05)', () => {
  it('accepts when membership and rotation coverage are unchanged', async () => {
    const { service, createOverride, updateSwap, requestMembers } = createHarness([
      active('requester', 0),
      active('colleague', 1),
    ]);
    void requestMembers;
    await expect(service.decideSwap('swap-1', 'accept', colleagueViewer)).resolves.toBeUndefined();
    expect(createOverride).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: 'colleague', swapRequestId: 'swap-1' }),
    }));
    expect(updateSwap).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'ACCEPTED' }),
    }));
  });

  it('rejects when the colleague was removed from the rotation after requesting', async () => {
    const { service, createOverride } = createHarness([active('requester', 0)]);
    await expect(service.decideSwap('swap-1', 'accept', colleagueViewer)).rejects.toMatchObject({
      code: onCallErrorCodes.swapNotAllowed,
    });
    expect(createOverride).not.toHaveBeenCalled();
  });

  it('rejects when the colleague was deactivated after requesting', async () => {
    const { service, createOverride } = createHarness([
      active('requester', 0),
      { userId: 'colleague', position: 1, user: { isActive: false, anonymizedAt: null } },
    ]);
    await expect(service.decideSwap('swap-1', 'accept', colleagueViewer)).rejects.toMatchObject({
      code: onCallErrorCodes.swapNotAllowed,
    });
    expect(createOverride).not.toHaveBeenCalled();
  });

  it('rejects when a schedule edit moved the interval out of the requester rotation', async () => {
    const { service, createOverride } = createHarness([
      active('colleague', 0),
      active('requester', 1),
    ]);
    await expect(service.decideSwap('swap-1', 'accept', colleagueViewer)).rejects.toMatchObject({
      code: onCallErrorCodes.swapNotAllowed,
    });
    expect(createOverride).not.toHaveBeenCalled();
  });
});
