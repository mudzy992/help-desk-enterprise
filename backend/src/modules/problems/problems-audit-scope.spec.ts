import { ProblemsService } from './problems.service';
import { ProblemSweepService } from './sweep/problem-sweep.service';
import { auditLogActions } from '../audit-log/audit-log.constants';

const viewer = { userId: 'actor', homeOrganizationalUnitId: 'ou-1' } as never;

function harness() {
  const row = {
    id: 'problem-1', organizationalUnitId: 'ou-1', version: 1, status: 'NEW',
    ownerUserId: 'actor', groupId: 'group-1', rootCause: 'cause', rootCauseCategory: 'other',
    workaround: 'workaround', resolution: 'resolved', priority: 'MEDIUM',
  };
  const tx = {
    $queryRaw: jest.fn(async () => [{ lastNumber: 1 }]),
    $executeRaw: jest.fn(async () => 1),
    problem: {
      create: jest.fn(async () => ({ id: row.id })),
      findFirst: jest.fn(async () => row),
      findMany: jest.fn(async () => [{ id: row.id, version: row.version, organizationalUnitId: row.organizationalUnitId }]),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    problemEvent: { create: jest.fn(async () => ({})) },
    auditLog: { findFirst: jest.fn(async () => null), create: jest.fn(async () => ({})) },
    group: { findUnique: jest.fn(async () => ({ isProblemGroup: true })) },
    priorityMatrixRule: { findUnique: jest.fn(async () => null) },
  };
  const prisma = { ...tx, $transaction: jest.fn(async (fn: (arg: typeof tx) => Promise<unknown>) => fn(tx)) };
  const access = {
    require: jest.fn(async () => ({ all: true, paths: [] })),
    requireUnitInScope: jest.fn(async () => undefined),
    requireGroupAuthority: jest.fn(async () => undefined),
    hasPermission: jest.fn(() => true),
    configuration: jest.fn(async () => ({ numberPrefix: 'P-', targetEnabled: false, requireWorkaroundForKnownError: false })),
  };
  const service = new ProblemsService(prisma as never, access as never);
  jest.spyOn(service, 'get').mockResolvedValue({} as never);
  return { prisma, tx, service, access, row };
}

describe('problem entity audit scope', () => {
  it('creates the problem and a scoped audit entry in the same transaction', async () => {
    const { service, tx } = harness();
    await service.create(viewer, { title: 'Printer issue', description: 'Printer failure', groupId: 'group-1', organizationalUnitId: 'ou-1' } as never);
    expect(tx.problem.create).toHaveBeenCalled();
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      action: auditLogActions.problemCreated, entityId: 'problem-1', organizationalUnitId: 'ou-1', chainPartition: 'ou:ou-1',
    }) }));
  });

  it.each([
    ['NEW', 'INVESTIGATING', auditLogActions.problemStatusChanged],
    ['NEW', 'CANCELLED', auditLogActions.problemCancelled],
    ['RESOLVED', 'INVESTIGATING', auditLogActions.problemReopened],
    ['RESOLVED', 'CLOSED', auditLogActions.problemClosed],
  ] as const)('audits %s → %s with entity scope and allowed metadata', async (from, to, action) => {
    const { service, tx, row } = harness();
    row.status = from;
    await service.changeStatus(viewer, row.id, { version: 1, status: to, reason: 'reason for transition' } as never);
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action, organizationalUnitId: 'ou-1', chainPartition: 'ou:ou-1' }) }));
  });

  it('automatic closing uses the problem unit for the audit partition', async () => {
    const { prisma, tx, access } = harness();
    const sweep = new ProblemSweepService(prisma as never, access as never, {} as never);
    await expect(sweep.autoClose(new Date(), 2)).resolves.toBe(1);
    expect(tx.problem.findMany).toHaveBeenCalledWith(expect.objectContaining({ select: expect.objectContaining({ organizationalUnitId: true }) }));
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: auditLogActions.problemClosed, organizationalUnitId: 'ou-1', actorUserId: null }) }));
  });
});
