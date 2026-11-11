jest.mock('../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));
jest.mock('../audit-log/record-audit-entry', () => ({ recordAuditEntry: jest.fn(async () => undefined) }));

import type { TransactionalOutboxService } from '../../common/outbox/transactional-outbox.service';
import { recordAuditEntry } from '../audit-log/record-audit-entry';
import { permissionKeys } from '../authorization/authorization.constants';
import { ChangesService } from './changes.service';
import { changeDowntimeSyncTopic } from './change-downtime-outbox';

const plannedStart = new Date('2030-05-01T12:00:00.000Z');
const plannedEnd = new Date('2030-05-01T13:00:00.000Z');

function scheduledDraft() {
  return {
    id: 'change-1',
    version: 4,
    sequence: 12,
    status: 'DRAFT',
    type: 'STANDARD',
    title: 'Planned network maintenance',
    description: 'Maintenance window',
    reason: 'Upgrade network equipment',
    implementationPlan: 'Replace the switch',
    backoutPlan: 'Restore the old switch',
    testPlan: 'Verify connectivity',
    plannedStart,
    plannedEnd,
    causesDowntime: true,
    cabGroupId: null,
    templateId: 'template-1',
    requesterUserId: 'requester-1',
    problemId: null,
    organizationalUnitId: 'unit-1',
    approvalRound: 1,
    conflictsAcknowledgedAt: null,
    services: [{ service: { id: 'service-1' } }],
    assets: [],
    _count: { services: 1, assets: 0 },
  };
}

describe('ChangesService durable downtime command', () => {
  beforeEach(() => jest.clearAllMocks());

  it('enqueues a schedule transition in the same transaction as the lifecycle version update', async () => {
    let inTransaction = false;
    const transactionEvents: string[] = [];
    const transaction = {
      changeRequest: {
        updateMany: jest.fn(async () => {
          transactionEvents.push('change-update');
          return { count: 1 };
        }),
      },
      changeEvent: { create: jest.fn(async () => undefined) },
    };
    const prisma = {
      $transaction: jest.fn(async (work: (tx: unknown) => unknown) => {
        inTransaction = true;
        try {
          return await work(transaction);
        } finally {
          inTransaction = false;
        }
      }),
    };
    const access = {
      require: jest.fn(async (_viewer: unknown, permission: string) => {
        expect(permission).toBe(permissionKeys.changeRead);
        return { unitIds: ['unit-1'] };
      }),
      configuration: jest.fn(async () => ({
        numberPrefix: 'CHG',
        normalQuorum: 1,
        emergencyQuorum: 1,
        minLeadTimeHours: 0,
        requireTestPlan: false,
        freezePeriods: [],
        reminderHoursBeforeStart: 24,
        timeZone: 'UTC',
      })),
    };
    const schedule = {
      conflictsFor: jest.fn(async () => ({ changes: [], downtime: [], freeze: null, freezeBlocks: false })),
    };
    const outbox = {
      enqueue: jest.fn(async () => {
        expect(inTransaction).toBe(true);
        transactionEvents.push('outbox-enqueue');
        return { id: 'outbox-1', created: true };
      }),
    };
    const service = new ChangesService(
      prisma as never,
      access as never,
      schedule as never,
      outbox as unknown as TransactionalOutboxService,
    );
    const current = scheduledDraft();
    const internals = service as unknown as {
      loadInScope: (...args: unknown[]) => Promise<unknown>;
      assertActionAllowed: (...args: unknown[]) => Promise<void>;
    };
    jest.spyOn(internals, 'loadInScope').mockResolvedValue(current);
    jest.spyOn(internals, 'assertActionAllowed').mockResolvedValue(undefined);
    jest.spyOn(service, 'get').mockResolvedValue({ id: 'change-1' } as never);

    await service.act(
      { userId: 'manager-1' } as never,
      'change-1',
      { action: 'schedule', version: current.version, acknowledgeConflicts: false } as never,
    );

    expect(schedule.conflictsFor).toHaveBeenCalled();
    expect(transactionEvents).toEqual(['change-update', 'outbox-enqueue']);
    expect(outbox.enqueue).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        topic: changeDowntimeSyncTopic,
        dedupeKey: 'change:change-1:v5',
        payload: { changeId: 'change-1', actorUserId: 'manager-1' },
        maxAttempts: 10,
      }),
    );
    expect(recordAuditEntry).toHaveBeenCalled();
  });
});
