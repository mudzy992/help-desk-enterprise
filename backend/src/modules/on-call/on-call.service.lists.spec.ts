import type { PrismaService } from '../../common/prisma/prisma.service';
import type { SettingsService } from '../settings/settings.service';
import { OnCallService } from './on-call.service';
import type { OnCallViewer } from './on-call-viewer';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));
jest.mock('../settings/settings.service', () => ({
  SettingsService: class SettingsService {},
}));
jest.mock('../audit-log/append-audit-log', () => ({ appendAuditLog: jest.fn() }));

const viewer: OnCallViewer = {
  userId: 'actor-1',
  canRead: true,
  canManage: false,
  readScope: { global: true, organizationalUnitPaths: [] },
  manageScope: { global: false, organizationalUnitPaths: [] },
};

const future = (days: number) => new Date(Date.now() + days * 86_400_000);

function overrideRow(index: number) {
  return {
    id: `override-${index}`,
    userId: 'member-1',
    startsAt: future(index + 1),
    endsAt: future(index + 2),
    reason: 'coverage',
    swapRequestId: null,
    createdAt: future(0),
  };
}

function swapRow(index: number) {
  return {
    id: `swap-${index}`,
    status: 'PENDING',
    requesterId: 'member-1',
    colleagueId: 'actor-1',
    startsAt: future(index + 1),
    endsAt: future(index + 2),
    reason: 'please',
    decidedAt: null,
    createdAt: future(0),
    schedule: { timezone: 'UTC', group: { id: 'group-1', name: 'IT Support' } },
  };
}

describe('on-call list truncation flags (BA-on-call-11)', () => {
  it('mySwaps returns at most 50 items and reports hasMore', async () => {
    const rows = Array.from({ length: 51 }, (_, index) => swapRow(index));
    const prisma = {
      group: { findMany: jest.fn(async () => [{ id: 'group-1', organizationalUnit: { ouPath: '/root' } }]) },
      onCallSchedule: { findMany: jest.fn(async () => [{ id: 'schedule-1' }]) },
      onCallSwapRequest: { findMany: jest.fn(async () => rows) },
      user: { findMany: jest.fn(async () => []) },
    };
    const settings = { getSetting: jest.fn(async () => true) };
    const service = new OnCallService(prisma as unknown as PrismaService, settings as unknown as SettingsService);
    const result = await service.mySwaps(viewer);
    expect(result.items).toHaveLength(50);
    expect(result.hasMore).toBe(true);
    expect(prisma.onCallSwapRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 51 }));
  });

  it('detail caps overrides at 200 and pending swaps at 100 with hasMore flags', async () => {
    const schedule = {
      id: 'schedule-1',
      groupId: 'group-1',
      updatedAt: new Date(),
      timezone: 'UTC',
      handoffMinute: 480,
      rotationLength: 'WEEK',
      rotationStartDate: '2026-01-05',
      isActive: true,
      autoAssignOutsideHours: false,
      ownerUserId: null,
      members: [
        { userId: 'member-1', position: 0, user: { isActive: true, anonymizedAt: null } },
      ],
    };
    const detailOverrides = Array.from({ length: 201 }, (_, index) => overrideRow(index));
    const detailSwaps = Array.from({ length: 101 }, (_, index) => swapRow(index));
    const prisma = {
      group: {
        findUnique: jest.fn(async () => ({ id: 'group-1', name: 'IT Support', organizationalUnit: { ouPath: '/root' } })),
        findMany: jest.fn(async () => []),
      },
      onCallSchedule: { findUnique: jest.fn(async () => schedule), findMany: jest.fn(async () => []) },
      onCallOverride: {
        findMany: jest.fn(async (query: { where?: { scheduleId?: unknown } }) =>
          query.where?.scheduleId !== undefined && typeof query.where.scheduleId === 'object' ? [] : detailOverrides,
        ),
      },
      onCallSwapRequest: { findMany: jest.fn(async () => detailSwaps) },
      groupMember: { findMany: jest.fn(async () => [{ groupId: 'group-1', userId: 'member-1' }]) },
      user: { findMany: jest.fn(async () => []) },
    };
    const settings = { getSetting: jest.fn(async () => true) };
    const service = new OnCallService(prisma as unknown as PrismaService, settings as unknown as SettingsService);
    const detail = await service.detail('group-1', {}, viewer);
    expect(detail.overrides).toHaveLength(200);
    expect(detail.swaps).toHaveLength(100);
    expect(detail.overridesHasMore).toBe(true);
    expect(detail.swapsHasMore).toBe(true);
  });
});
