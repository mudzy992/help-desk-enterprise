import type { PrismaService } from '../../common/prisma/prisma.service';
import type { SettingsService } from '../settings/settings.service';
import type { OnCallService } from './on-call.service';
import { OnCallSweepService, onCallRetentionLimits } from './on-call-sweep.service';

jest.mock('../settings/settings.service', () => ({
  SettingsService: class SettingsService {},
}));

const ids = (prefix: string, count: number, offset = 0) =>
  Array.from({ length: count }, (_, index) => ({ id: `${prefix}-${offset + index}` }));

function createHarness(options: {
  overrideBatches: readonly { id: string }[][];
  failingDelete?: boolean;
}) {
  let overrideCall = 0;
  const deleteMany = jest.fn(async ({ where }: { where: { id: { in: string[] } } }) => {
    if (options.failingDelete) throw new Error('delete failed');
    return { count: where.id.in.length };
  });
  const prisma = {
    onCallSchedule: { findMany: jest.fn(async () => []) },
    onCallOverride: {
      findMany: jest.fn(async () => options.overrideBatches[overrideCall++] ?? []),
      deleteMany,
    },
    onCallSwapRequest: {
      findMany: jest.fn(async () => []),
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
    group: { findMany: jest.fn(async () => []) },
    ticket: { count: jest.fn(async () => 0) },
  };
  const settings = {
    getSetting: jest.fn(async (key: string) => (key.endsWith('historyRetentionDays') ? 30 : '15:00')),
  };
  const onCall = { isEnabled: jest.fn(async () => true), notify: jest.fn(async () => true) };
  const service = new OnCallSweepService(
    prisma as unknown as PrismaService,
    settings as unknown as SettingsService,
    onCall as unknown as OnCallService,
  );
  return { service, prisma, deleteMany };
}

describe('OnCallSweepService retention (BA-on-call-10)', () => {
  it('deletes in bounded batches of 500 until the backlog is drained', async () => {
    const { service, prisma, deleteMany } = createHarness({
      overrideBatches: [ids('ov', onCallRetentionLimits.batch), ids('ov', 3, 500)],
    });
    await expect(service.processDue(new Date('2026-11-10T12:00:00Z'))).resolves.toBe(0);
    expect(prisma.onCallOverride.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 500 }));
    expect(deleteMany).toHaveBeenCalledTimes(2);
    expect(deleteMany.mock.calls[0]?.[0].where.id.in).toHaveLength(500);
    expect(deleteMany.mock.calls[1]?.[0].where.id.in).toHaveLength(3);
  });

  it('stops at the per-run cap and reports a backlog instead of deleting unboundedly', async () => {
    const full = ids('ov', onCallRetentionLimits.batch);
    const { service, deleteMany } = createHarness({
      overrideBatches: Array.from({ length: onCallRetentionLimits.maxBatchesPerRun + 5 }, () => full),
    });
    await expect(service.processDue(new Date('2026-11-10T12:00:00Z'))).resolves.toBe(0);
    expect(deleteMany).toHaveBeenCalledTimes(onCallRetentionLimits.maxBatchesPerRun);
  });

  it('propagates a retention failure so the job fails and retries', async () => {
    const { service } = createHarness({ overrideBatches: [ids('ov', 2)], failingDelete: true });
    await expect(service.processDue(new Date('2026-11-10T12:00:00Z'))).rejects.toThrow('delete failed');
  });
});
