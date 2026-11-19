import { Logger } from '@nestjs/common';
import { ChangeSweepService } from './change-sweep.service';
import { changeReminderDispatchTopic } from './change-reminder-outbox';

const now = new Date('2030-05-01T07:50:00.000Z');
const plannedStart = new Date('2030-05-01T08:00:00.000Z');
const plannedEnd = new Date('2030-05-01T09:00:00.000Z');

type Candidate = {
  id: string;
  status: 'SCHEDULED' | 'IMPLEMENTING';
  plannedStart: Date | null;
  plannedEnd: Date | null;
  reminderSentAt: Date | null;
  overdueNotifiedAt: Date | null;
};

function candidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    id: 'change-1',
    status: 'SCHEDULED',
    plannedStart,
    plannedEnd,
    reminderSentAt: null,
    overdueNotifiedAt: null,
    ...overrides,
  };
}

function harness(options: { claimed?: boolean; failEnqueue?: boolean; rows?: Candidate[] } = {}) {
  const txUpdateMany = jest.fn(async () => ({ count: options.claimed === false ? 0 : 1 }));
  const txEventCreate = jest.fn(async () => ({ id: 'event-1' }));
  const transaction = { changeRequest: { updateMany: txUpdateMany }, changeEvent: { create: txEventCreate } };
  const prisma = {
    changeRequest: {
      findMany: jest.fn(async () => options.rows ?? [candidate()]),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(async (callback: (tx: typeof transaction) => Promise<boolean>) => callback(transaction)),
  };
  const access = {
    isEnabled: jest.fn(async () => true),
    configuration: jest.fn(async () => ({ reminderHoursBeforeStart: 4 })),
  };
  const outbox = {
    enqueue: options.failEnqueue
      ? jest.fn(async () => {
          throw new Error('outbox unavailable');
        })
      : jest.fn(async () => ({ id: 'outbox-1', created: true })),
  };
  const service = new ChangeSweepService(prisma as never, access as never, outbox as never);
  return { service, prisma, access, outbox, transaction, txUpdateMany, txEventCreate };
}

describe('ChangeSweepService (BA-changes-07)', () => {
  it('skips without touching anything when the module is off', async () => {
    const { service, prisma, outbox } = harness();
    (service as unknown as { access: { isEnabled: jest.Mock } }).access.isEnabled.mockResolvedValueOnce(false);

    await expect(service.run(now)).resolves.toEqual({ skipped: 'module_disabled', reminders: 0, overdue: 0 });
    expect(prisma.changeRequest.findMany).not.toHaveBeenCalled();
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });

  it('claims the notice and its delivery intent in one transaction', async () => {
    const { service, prisma, outbox, transaction, txUpdateMany, txEventCreate } = harness();

    await expect(service.run(now)).resolves.toEqual({ skipped: null, reminders: 1, overdue: 0 });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    // The mark is never written outside the transaction that also persists the intent.
    expect(prisma.changeRequest.updateMany).not.toHaveBeenCalled();
    expect(txUpdateMany).toHaveBeenCalledWith({
      where: { id: 'change-1', status: 'SCHEDULED', reminderSentAt: null },
      data: { reminderSentAt: now },
    });
    expect(txEventCreate).toHaveBeenCalledWith({
      data: { changeId: 'change-1', action: 'reminder', actorUserId: null, detail: { kind: 'starting_soon' } },
    });
    expect(outbox.enqueue).toHaveBeenCalledWith(transaction, {
      topic: changeReminderDispatchTopic,
      dedupeKey: `change-reminder:starting_soon:change-1:s${plannedStart.getTime()}`,
      payload: { changeId: 'change-1', kind: 'starting_soon', occurrence: `s${plannedStart.getTime()}` },
      maxAttempts: 8,
    });
  });

  it('counts an overrun warning on the same terms', async () => {
    const { service, outbox, txUpdateMany } = harness({
      rows: [candidate({ status: 'IMPLEMENTING', plannedEnd: new Date('2030-05-01T07:00:00.000Z') })],
    });

    await expect(service.run(now)).resolves.toEqual({ skipped: null, reminders: 0, overdue: 1 });

    expect(txUpdateMany).toHaveBeenCalledWith({
      where: { id: 'change-1', status: 'IMPLEMENTING', overdueNotifiedAt: null },
      data: { overdueNotifiedAt: now },
    });
    expect(outbox.enqueue).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ payload: { changeId: 'change-1', kind: 'overdue', occurrence: `o${new Date('2030-05-01T07:00:00.000Z').getTime()}` } }),
    );
  });

  it('does nothing when a concurrent worker already claimed the mark', async () => {
    const { service, outbox, txEventCreate } = harness({ claimed: false });

    await expect(service.run(now)).resolves.toEqual({ skipped: null, reminders: 0, overdue: 0 });
    expect(txEventCreate).not.toHaveBeenCalled();
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });

  it('keeps the mark empty and retries later when the intent cannot be persisted', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { service, prisma, outbox } = harness({ failEnqueue: true });

    await expect(service.run(now)).resolves.toEqual({ skipped: null, reminders: 0, overdue: 0 });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(outbox.enqueue).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('change_sweep_enqueue_failed change=change-1'));
    warn.mockRestore();
  });

  it('ignores candidates the planner no longer considers due', async () => {
    const { service, prisma, outbox } = harness({
      rows: [candidate({ plannedStart: new Date('2030-05-02T08:00:00.000Z') })],
    });

    await expect(service.run(now)).resolves.toEqual({ skipped: null, reminders: 0, overdue: 0 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });
});
