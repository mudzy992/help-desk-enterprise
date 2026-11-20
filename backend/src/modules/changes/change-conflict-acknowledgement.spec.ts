jest.mock('../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));
jest.mock('../audit-log/record-audit-entry', () => ({ recordAuditEntry: jest.fn(async () => undefined) }));

import type { TransactionalOutboxService } from '../../common/outbox/transactional-outbox.service';
import { recordAuditEntry } from '../audit-log/record-audit-entry';
import { auditLogActions } from '../audit-log/audit-log.constants';
import { permissionKeys } from '../authorization/authorization.constants';
import { changeConflictSnapshot } from './change-conflict-snapshot';
import type { ChangeConflicts } from './change-conflicts';
import { ChangesService } from './changes.service';
import { ChangeError, changeErrorCodes } from './changes.constants';

const plannedStart = new Date('2030-05-01T10:00:00.000Z');
const plannedEnd = new Date('2030-05-01T12:00:00.000Z');
const conflictWindow = { start: plannedStart, end: plannedEnd };

function draft() {
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
    causesDowntime: false,
    cabGroupId: null,
    templateId: 'template-1',
    requesterUserId: 'requester-1',
    ownerUserId: 'manager-1',
    problemId: null,
    organizationalUnitId: 'unit-1',
    approvalRound: 1,
    conflictsAcknowledgedAt: null as Date | null,
    outcome: null,
    reviewNotes: null,
    services: [{ service: { id: 'service-1' } }],
    assets: [],
    _count: { services: 1, assets: 0 },
  };
}

function otherChange(id: string): ChangeConflicts['changes'][number] {
  return {
    id,
    sequence: 99,
    title: 'Other maintenance',
    status: 'SCHEDULED',
    start: plannedStart,
    end: plannedEnd,
    serviceIds: ['service-1'],
    assetIds: [],
    sharedServiceIds: ['service-1'],
    sharedAssetIds: [],
  };
}

function build(options: {
  readonly current?: ReturnType<typeof draft>;
  readonly before: ChangeConflicts;
  readonly insideTransaction?: ChangeConflicts;
}) {
  const transaction = {
    changeRequest: { updateMany: jest.fn(async (..._args: unknown[]) => ({ count: 1 })) },
    changeEvent: { create: jest.fn(async (..._args: unknown[]) => undefined) },
  };
  const prisma = {
    $transaction: jest.fn(async (work: (tx: unknown) => unknown) => work(transaction)),
  };
  const access = {
    require: jest.fn(async () => ({ unitIds: ['unit-1'] })),
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
  const conflictsFor = jest
    .fn()
    .mockResolvedValueOnce(options.before)
    .mockResolvedValue(options.insideTransaction ?? options.before);
  const outbox = { enqueue: jest.fn(async () => ({ id: 'outbox-1', created: true })) };
  const describe = jest.fn(async (conflicts: ChangeConflicts) => ({
    changes: conflicts.changes.map((row) => ({
      id: row.id,
      sequence: row.sequence,
      title: row.title,
      status: row.status,
      plannedStart: row.start.toISOString(),
      plannedEnd: row.end.toISOString(),
      sharedServices: row.serviceIds.map((id) => ({ id, name: 'Mreža' })),
      sharedAssetCount: 0,
    })),
    downtime: conflicts.downtime,
    restricted: { changes: 0, downtime: 0 },
    freeze: conflicts.freeze,
    freezeBlocks: conflicts.freezeBlocks,
    hasWarnings:
      conflicts.changes.length > 0 ||
      conflicts.downtime.length > 0 ||
      (conflicts.freeze !== null && !conflicts.freezeBlocks),
  }));
  const service = new ChangesService(
    prisma as never,
    access as never,
    { conflictsFor, describe } as never,
    outbox as unknown as TransactionalOutboxService,
  );
  const current = options.current ?? draft();
  const internals = service as unknown as {
    loadInScope: (...args: unknown[]) => Promise<unknown>;
    assertActionAllowed: (...args: unknown[]) => Promise<void>;
  };
  jest.spyOn(internals, 'loadInScope').mockResolvedValue(current);
  jest.spyOn(internals, 'assertActionAllowed').mockResolvedValue(undefined);
  jest.spyOn(service, 'get').mockResolvedValue({ id: 'change-1' } as never);
  return { service, prisma, transaction, conflictsFor, access, current };
}

const conflicting: ChangeConflicts = {
  changes: [otherChange('change-2')],
  downtime: [],
  freeze: null,
  freezeBlocks: false,
};

async function expectChangeError(promise: Promise<unknown>, code: string, detail?: string) {
  await expect(promise).rejects.toBeInstanceOf(ChangeError);
  await promise.catch((error: ChangeError) => {
    expect(error.code).toBe(code);
    if (detail !== undefined) expect(error.detail).toBe(detail);
  });
}

describe('change conflict acknowledgement digest (W7.68, BA-changes-12)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('refuses the flag alone: an acknowledgement without a digest covers nothing', async () => {
    const { service, prisma, current } = build({ before: conflicting });
    await expectChangeError(
      service.act({ userId: 'manager-1' } as never, 'change-1', {
        action: 'schedule',
        version: current.version,
        acknowledgeConflicts: true,
      } as never),
      changeErrorCodes.conflictsStale,
      'snapshot_missing',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses a digest of a different snapshot', async () => {
    const { service, prisma, current } = build({ before: conflicting });
    await expectChangeError(
      service.act({ userId: 'manager-1' } as never, 'change-1', {
        action: 'schedule',
        version: current.version,
        acknowledgeConflicts: true,
        conflictSnapshotHash: changeConflictSnapshot(
          { changes: [otherChange('change-9')], downtime: [], freeze: null, freezeBlocks: false },
          conflictWindow,
        ).hash,
      } as never),
      changeErrorCodes.conflictsStale,
      'snapshot_changed',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('accepts the digest it previewed and records it in the history and the audit', async () => {
    const hash = changeConflictSnapshot(conflicting, conflictWindow).hash;
    const { service, transaction, conflictsFor, current } = build({ before: conflicting });

    await service.act({ userId: 'manager-1' } as never, 'change-1', {
      action: 'schedule',
      version: current.version,
      acknowledgeConflicts: true,
      conflictSnapshotHash: hash,
    } as never);

    // Re-read inside the transaction, with the transaction client.
    expect(conflictsFor).toHaveBeenCalledTimes(2);
    expect(conflictsFor.mock.calls[1][2]).toBe(transaction);
    const acknowledgedEvent = transaction.changeEvent.create.mock.calls.find(
      ([args]) => (args as { data: { action: string } }).data.action === 'conflicts_acknowledged',
    );
    expect(acknowledgedEvent).toBeDefined();
    const detail = (acknowledgedEvent?.[0] as { data: { detail: { snapshot: { hash: string } } } }).data
      .detail;
    expect(detail.snapshot.hash).toBe(hash);
    expect(recordAuditEntry).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        action: auditLogActions.changeStatusChanged,
        metadata: expect.objectContaining({ conflictsAcknowledged: hash }),
      }),
    );
  });

  it('aborts when another change takes the slot between the preview and the commit', async () => {
    const hash = changeConflictSnapshot(conflicting, conflictWindow).hash;
    const { service, prisma, transaction, current } = build({
      before: conflicting,
      insideTransaction: {
        ...conflicting,
        changes: [...conflicting.changes, otherChange('change-3')],
      },
    });

    await expectChangeError(
      service.act({ userId: 'manager-1' } as never, 'change-1', {
        action: 'schedule',
        version: current.version,
        acknowledgeConflicts: true,
        conflictSnapshotHash: hash,
      } as never),
      changeErrorCodes.conflictsStale,
      'snapshot_changed',
    );
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(transaction.changeRequest.updateMany).not.toHaveBeenCalled();
  });

  it('does not ask for a digest once the window is already acknowledged', async () => {
    const { service, transaction, current } = build({
      current: { ...draft(), conflictsAcknowledgedAt: new Date('2030-04-01T09:00:00.000Z') },
      before: conflicting,
    });

    await service.act({ userId: 'manager-1' } as never, 'change-1', {
      action: 'schedule',
      version: current.version,
    } as never);

    expect(transaction.changeRequest.updateMany).toHaveBeenCalled();
    expect(
      transaction.changeEvent.create.mock.calls.some(
        ([args]) => (args as { data: { action: string } }).data.action === 'conflicts_acknowledged',
      ),
    ).toBe(false);
  });

  it('does not ask for a digest when the window has no conflicts', async () => {
    const { service, transaction, current } = build({
      before: { changes: [], downtime: [], freeze: null, freezeBlocks: false },
    });
    await service.act({ userId: 'manager-1' } as never, 'change-1', {
      action: 'schedule',
      version: current.version,
    } as never);
    expect(transaction.changeRequest.updateMany).toHaveBeenCalled();
    expect(recordAuditEntry).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        metadata: expect.not.objectContaining({ conflictsAcknowledged: expect.anything() }),
      }),
    );
  });

  it('returns the digest of the preview so the client can echo it', async () => {
    const { service } = build({ before: conflicting });
    const preview = await service.conflicts({ userId: 'manager-1' } as never, 'change-1');
    expect(preview.snapshotHash).toBe(changeConflictSnapshot(conflicting, conflictWindow).hash);
    expect(preview.acknowledgedAt).toBeNull();
    expect(preview.hasWarnings).toBe(true);
    // The preview keeps naming the conflict; the digest is additional, not a
    // replacement for what the user reads.
    expect(preview.changes.map((row) => row.id)).toEqual(['change-2']);
  });

  it('has no digest for a change without a window', async () => {
    const { service } = build({
      current: { ...draft(), plannedStart: null as never, plannedEnd: null as never },
      before: conflicting,
    });
    const preview = await service.conflicts({ userId: 'manager-1' } as never, 'change-1');
    expect(preview.snapshotHash).toBeNull();
    expect(preview.hasWarnings).toBe(false);
  });

  it('keeps the read permission on the preview', async () => {
    const { service, access } = build({ before: conflicting });
    await service.conflicts({ userId: 'manager-1' } as never, 'change-1');
    expect(access.require).toHaveBeenCalledWith(
      { userId: 'manager-1' },
      permissionKeys.changeRead,
    );
  });
});
