import { ProblemsService } from './problems.service';

// The owner-eligibility rule reads the target user's grants; the test supplies one.
jest.mock('../../common/principal-context/load-principal-context', () => ({
  loadPrincipalContext: jest.fn(async (_prisma: unknown, userId: string) => ({
    subjectId: userId,
    isActive: true,
    homeOrganizationalUnitId: 'ou-1',
    groupIds: ['group-1'],
    assignments: [
      {
        roleKey: 'MANAGER',
        organizationalUnitId: 'ou-1',
        organizationalUnitPath: '/root/ou-1',
        serviceId: null,
        permissionKeys: ['problem.manage'],
      },
    ],
  })),
}));
import { problemCreatedOccurrence, problemVersionOccurrence } from './problem-notice-occurrence';

/**
 * W7.42 (BA-problems-21): the notice intent is written *inside* the transaction
 * of the write it announces. These tests assert the transaction identity, not
 * the notifier: a delivery failure can never take the user's write with it, but
 * a lost intent can never happen either.
 */
const viewer = { userId: 'actor', homeOrganizationalUnitId: 'ou-1' } as never;

function harness(options: { readonly enqueueFails?: boolean } = {}) {
  const row = {
    id: 'problem-1',
    organizationalUnitId: 'ou-1',
    version: 1,
    status: 'NEW',
    ownerUserId: 'actor',
    groupId: 'group-1',
    rootCause: 'cause',
    rootCauseCategory: 'other',
    workaround: 'workaround',
    resolution: 'resolved',
    priority: 'MEDIUM',
    impact: 'MEDIUM',
    urgency: 'MEDIUM',
    serviceId: null,
    organizationalUnit: { id: 'ou-1', ouPath: '/root/ou-1' },
    title: 'Printer issue',
    description: 'description text',
  };
  const tx = {
    $queryRaw: jest.fn(async () => [{ lastNumber: 1 }]),
    $executeRaw: jest.fn(async () => 1),
    problem: {
      create: jest.fn(async () => ({ id: row.id })),
      findFirst: jest.fn(async () => row),
      findUnique: jest.fn(async () => row),
      findMany: jest.fn(async () => [{ id: row.id, version: row.version, organizationalUnitId: row.organizationalUnitId }]),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    problemEvent: { create: jest.fn(async () => ({})) },
    problemHandoff: { updateMany: jest.fn(async () => ({ count: 0 })) },
    auditLog: { findFirst: jest.fn(async () => null), create: jest.fn(async () => ({})) },
    group: { findUnique: jest.fn(async () => ({ isProblemGroup: true, organizationalUnit: { ouPath: 'root' } })) },
    organizationalUnit: { findUnique: jest.fn(async () => ({ ouPath: 'root' })) },
    user: {
      findUnique: jest.fn(async () => ({
        id: 'owner',
        isActive: true,
        anonymizedAt: null,
        organizationalUnit: { ouPath: '/root/ou-1' },
        groupMemberships: [{ groupId: 'group-1' }],
      })),
    },
    priorityMatrixRule: { findUnique: jest.fn(async () => null) },
    outboxMessage: { findUniqueOrThrow: jest.fn(), create: jest.fn() },
  };
  const prisma = { ...tx, $transaction: jest.fn(async (fn: (arg: typeof tx) => Promise<unknown>) => fn(tx)) };
  const access = {
    require: jest.fn(async () => ({ all: true, paths: [] })),
    requireUnitInScope: jest.fn(async () => undefined),
    requireGroupAuthority: jest.fn(async () => undefined),
    hasPermission: jest.fn(() => true),
    configuration: jest.fn(async () => ({ numberPrefix: 'P-', targetEnabled: false, requireWorkaroundForKnownError: false })),
  };
  const notices = {
    enqueue: jest.fn(async (_transaction: unknown, _intents: readonly unknown[]) => {
      if (options.enqueueFails === true) throw new Error('outbox unavailable');
    }),
    enqueueAfterCommit: jest.fn(async () => undefined),
  };
  const service = new ProblemsService(prisma as never, access as never, {} as never, {}, {} as never, notices as never);
  jest.spyOn(service, 'get').mockResolvedValue({} as never);
  return { prisma, tx, service, access, row, notices };
}

const intents = (notices: { enqueue: jest.Mock }): Record<string, unknown>[] =>
  notices.enqueue.mock.calls.flatMap((call) => call[1] as Record<string, unknown>[]);

describe('problem notice intents inside the write transaction', () => {
  it('queues the status notice with the status write', async () => {
    const { service, tx, row, notices } = harness();
    row.status = 'KNOWN_ERROR';
    await service.changeStatus(viewer, row.id, { version: 1, status: 'RESOLVED' } as never);

    expect(notices.enqueue).toHaveBeenCalledTimes(1);
    // Same transaction object that carried the problem update.
    expect(notices.enqueue.mock.calls[0][0]).toBe(tx);
    expect(intents(notices)).toEqual([
      expect.objectContaining({
        kind: 'status-changed',
        problemId: 'problem-1',
        status: 'RESOLVED',
        actorUserId: 'actor',
        occurrence: problemVersionOccurrence(row.version + 1),
      }),
    ]);
  });

  it('does not queue a notice for a status the agents are not told about', async () => {
    const { service, row, notices } = harness();
    await service.changeStatus(viewer, row.id, { version: 1, status: 'INVESTIGATING' } as never);
    expect(notices.enqueue).not.toHaveBeenCalled();
  });

  it('lets a resolution run own the occurrence by suppressing the version notice', async () => {
    const { service, row, notices } = harness();
    row.status = 'KNOWN_ERROR';
    await service.changeStatus(viewer, row.id, { version: 1, status: 'RESOLVED' } as never, { statusNotice: 'none' });
    expect(notices.enqueue).not.toHaveBeenCalled();
  });

  it('queues an ownership notice with the owner change', async () => {
    const { service, tx, row, notices } = harness();
    await service.update(viewer, row.id, { version: 1, ownerUserId: 'someone-else' } as never);

    expect(notices.enqueue.mock.calls[0][0]).toBe(tx);
    expect(intents(notices)).toEqual([
      expect.objectContaining({ kind: 'owner-assigned', problemId: 'problem-1', occurrence: problemVersionOccurrence(2) }),
    ]);
  });

  it('queues the creation notice with the created problem', async () => {
    const { service, tx, notices } = harness();
    await service.create(viewer, {
      title: 'Printer issue',
      description: 'Printer failure',
      groupId: 'group-1',
      organizationalUnitId: 'ou-1',
    } as never);

    expect(notices.enqueue.mock.calls[0][0]).toBe(tx);
    expect(intents(notices)).toEqual([
      expect.objectContaining({ kind: 'group-assigned', problemId: 'problem-1', occurrence: problemCreatedOccurrence }),
    ]);
  });

  it('fails the write when the intent cannot be recorded', async () => {
    const { service, row } = harness({ enqueueFails: true });
    row.status = 'KNOWN_ERROR';
    // An outbox that cannot accept the row is a database failure: the status
    // write rolls back with it, so the API can never answer "done" and lose the
    // notice at the same time.
    await expect(service.changeStatus(viewer, row.id, { version: 1, status: 'RESOLVED' } as never)).rejects.toThrow(
      'outbox unavailable',
    );
  });
});
