import { ProblemHandoffService, toProblemHandoffView } from './problem-handoff.service';
import { ProblemError, problemErrorCodes } from './problems.constants';
import { auditLogActions } from '../audit-log/audit-log.constants';
import { prepareAuditEntry } from '../audit-log/audit-event-policy';
import { recordAuditEntry } from '../audit-log/record-audit-entry';

jest.mock('../audit-log/record-audit-entry', () => ({ recordAuditEntry: jest.fn() }));

const audit = recordAuditEntry as jest.MockedFunction<typeof recordAuditEntry>;

beforeEach(() => {
  audit.mockReset();
  audit.mockImplementation(async (_transaction, input) => {
    prepareAuditEntry(input);
  });
});

const viewer = { userId: 'u1' } as never;

const problem = {
  id: 'p1',
  status: 'INVESTIGATING',
  version: 3,
  group: { id: 'g1', name: 'Grupa A' },
  organizationalUnit: { id: 'ou1', name: 'Jedinica A', ouPath: '/root/ou1' },
  owner: { id: 'u-owner', displayName: 'Vlasnik', email: 'owner@example.com' },
};

const handoffRow = {
  id: 'h1',
  status: 'PENDING',
  problemId: 'p1',
  fromGroupId: 'g1',
  toGroupId: 'g2',
  fromOrganizationalUnitId: 'ou1',
  toOrganizationalUnitId: 'ou2',
  requestedByUserId: 'u1',
  decidedByUserId: null as string | null,
  reason: 'Problem pripada drugoj grupi',
  decisionReason: null as string | null,
  decidedAt: null as Date | null,
  createdAt: new Date('2026-11-17T10:00:00Z'),
  fromGroup: { id: 'g1', name: 'Grupa A' },
  toGroup: { id: 'g2', name: 'Grupa B' },
  fromOrganizationalUnit: { id: 'ou1', name: 'Jedinica A' },
  toOrganizationalUnit: { id: 'ou2', name: 'Jedinica B' },
  requestedBy: { id: 'u1', displayName: 'Ana', email: 'ana@example.com' },
  decidedBy: null as { id: string; displayName: string; email: string } | null,
};

type Options = {
  /** Does the requester also run the target group (immediate acceptance)? */
  readonly targetAuthority?: boolean;
  readonly targetUnit?: string;
  readonly status?: string;
  readonly currentGroupId?: string | null;
  readonly pendingCount?: number;
  readonly decidedCount?: number;
  readonly movedCount?: number;
  readonly ownerEligible?: boolean;
  readonly targetGroupId?: string;
  readonly existingHandoff?: typeof handoffRow | null;
  readonly requireUnitFails?: boolean;
  readonly guardFails?: boolean;
};

function setup(options: Options = {}) {
  const state = {
    status: options.status ?? problem.status,
    groupId: options.currentGroupId ?? problem.group.id,
    version: problem.version,
    ownerUserId: problem.owner.id,
  };
  const targetUnit = options.targetUnit ?? 'ou2';
  const events: { action: string; detail: unknown }[] = [];
  const created: Record<string, unknown>[] = [];
  const handoffUpdates: Record<string, unknown>[] = [];
  const handoff = options.existingHandoff ?? handoffRow;
  const tx = {
    problem: {
      findFirst: jest.fn(async () => ({ ...state })),
      updateMany: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (options.movedCount === 0) return { count: 0 };
        Object.assign(state, data);
        return { count: 1 };
      }),
    },
    problemHandoff: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return { id: 'h1' };
      }),
      updateMany: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        handoffUpdates.push(data);
        return { count: options.decidedCount ?? 1 };
      }),
    },
    problemEvent: {
      create: jest.fn(async ({ data }: { data: { action: string; detail: unknown } }) => events.push(data)),
    },
    user: {
      count: jest.fn(async ({ where }: { where: { id: string } }) =>
        options.ownerEligible === false && where.id === problem.owner.id ? 0 : 1,
      ),
    },
  };
  const prisma = {
    ...tx,
    problemHandoff: {
      ...tx.problemHandoff,
      count: jest.fn(async () => options.pendingCount ?? 0),
      findFirst: jest.fn(async () => (options.existingHandoff === null ? null : handoff)),
      findUniqueOrThrow: jest.fn(async () => ({
        ...handoff,
        status: (created[0]?.status as string) ?? handoff.status,
        decidedAt: (created[0]?.decidedAt as Date) ?? handoff.decidedAt,
      })),
      findMany: jest.fn(async () => [handoff]),
    },
    group: {
      findUnique: jest.fn(async () => ({
        id: options.targetGroupId ?? 'g2',
        name: 'Grupa B',
        isProblemGroup: true,
        organizationalUnitId: targetUnit,
        organizationalUnit: { ouPath: '/root/ou2' },
      })),
    },
    $transaction: jest.fn(async (run: (client: unknown) => Promise<unknown>) => run(tx)),
  };
  const access = {
    require: jest.fn(async () => ({ all: true, paths: [] })),
    requireUnitInScope: jest.fn(async () => {
      if (options.requireUnitFails === true) throw new ProblemError(problemErrorCodes.outOfScope);
      return { id: targetUnit, ouPath: '/root/ou2', name: 'Jedinica B' };
    }),
    requireGroupAuthority: jest.fn(async () => {
      if (options.guardFails === true) throw new ProblemError(problemErrorCodes.forbidden, 'problem_group');
    }),
    hasGroupAuthority: jest.fn(async () => options.targetAuthority === true),
  };
  const problems = { get: jest.fn(async () => ({ ...problem, status: state.status, version: state.version })) };
  const notifier = {
    run: jest.fn((_label: string, operation: () => Promise<unknown>) => void operation()),
    groupAssigned: jest.fn(async () => 1),
    handoffRequested: jest.fn(async () => 1),
    handoffDecided: jest.fn(async () => 1),
  };
  const service = new ProblemHandoffService(prisma as never, access as never, problems as never, notifier as never);
  return { service, prisma, access, notifier, events, created, handoffUpdates, state, problems };
}

const input = { toGroupId: 'g2', reason: 'Problem pripada drugoj grupi' };

describe('ProblemHandoffService request', () => {
  it('accepts the transfer at once when the requester also runs the target group', async () => {
    const { service, prisma, notifier, events, created } = setup({ targetAuthority: true });
    const result = await service.request(viewer, 'p1', input);

    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ status: 'ACCEPTED', toGroupId: 'g2', fromGroupId: 'g1' });
    expect(created[0].decidedAt).toBeInstanceOf(Date);
    expect(prisma.problem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'p1', version: 3, groupId: 'g1' },
        data: expect.objectContaining({ groupId: 'g2', organizationalUnitId: 'ou2', version: { increment: 1 } }),
      }),
    );
    expect(events.map((event) => event.action)).toEqual(['handoff_accepted']);
    expect(audit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: auditLogActions.problemHandoffAccepted, metadata: expect.objectContaining({ autoAccepted: true }) }),
    );
    // The new group learns about its problem; nothing waits for a decision.
    expect(notifier.groupAssigned).toHaveBeenCalledWith('p1', 'u1');
    expect(notifier.handoffRequested).not.toHaveBeenCalled();
    expect(result.handoff.status).toBe('ACCEPTED');
  });

  it('waits for the target group when the requester does not run it', async () => {
    const { service, prisma, notifier, events, created } = setup({ targetAuthority: false });
    await service.request(viewer, 'p1', input);

    expect(created[0]).toMatchObject({ status: 'PENDING', toGroupId: 'g2', requestedByUserId: 'u1' });
    expect(prisma.problem.updateMany).not.toHaveBeenCalled();
    // Nothing about the problem changed, so it keeps its group and its scope.
    expect(events.map((event) => event.action)).toEqual(['handoff_requested']);
    expect(audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: auditLogActions.problemHandoffRequested }));
    expect(notifier.handoffRequested).toHaveBeenCalledWith('p1', 'h1', 'g2', 'u1');
    expect(notifier.groupAssigned).not.toHaveBeenCalled();
  });

  it('refuses a final problem, the same group, or a second request', async () => {
    await expect(setup({ status: 'CLOSED' }).service.request(viewer, 'p1', input)).rejects.toMatchObject({ code: problemErrorCodes.finalStatus });
    await expect(setup({ targetGroupId: 'g1' }).service.request(viewer, 'p1', { ...input, toGroupId: 'g1' })).rejects.toMatchObject({
      code: problemErrorCodes.handoffSameGroup,
    });
    await expect(setup({ pendingCount: 1 }).service.request(viewer, 'p1', input)).rejects.toMatchObject({ code: problemErrorCodes.handoffPending });
  });

  it('keeps the target unit inside the requester scope', async () => {
    await expect(setup({ requireUnitFails: true }).service.request(viewer, 'p1', input)).rejects.toMatchObject({ code: problemErrorCodes.outOfScope });
    await expect(setup({ guardFails: true }).service.request(viewer, 'p1', input)).rejects.toMatchObject({ code: problemErrorCodes.forbidden });
  });

  it('does not move a problem that changed while the request was validated', async () => {
    // Another command already moved the problem to another group.
    const { service } = setup({ targetAuthority: true, currentGroupId: 'g9' });
    await expect(service.request(viewer, 'p1', input)).rejects.toMatchObject({ code: problemErrorCodes.handoffConflict });
  });
});

describe('ProblemHandoffService decisions', () => {
  it('accept moves the problem, records the decision and tells both sides', async () => {
    const { service, prisma, notifier, events, handoffUpdates } = setup({ ownerEligible: false });
    await service.accept(viewer, 'p1', 'h1');

    expect(handoffUpdates[0]).toMatchObject({ status: 'ACCEPTED', decidedByUserId: 'u1' });
    expect(prisma.problem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ groupId: 'g2', organizationalUnitId: 'ou2', ownerUserId: 'u1' }) }),
    );
    expect(events.map((event) => event.action)).toEqual(['handoff_accepted']);
    expect(audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: auditLogActions.problemHandoffAccepted }));
    expect(notifier.groupAssigned).toHaveBeenCalledWith('p1', 'u1');
    expect(notifier.handoffDecided).toHaveBeenCalledWith('p1', 'h1', 'u1', 'u1');
  });

  it('keeps an owner who already belongs to the target group', async () => {
    const { service, prisma } = setup({ ownerEligible: true });
    await service.accept(viewer, 'p1', 'h1');
    expect(prisma.problem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ ownerUserId: 'u-owner' }) }),
    );
  });

  it('refuses to accept a problem that no longer sits in the source group', async () => {
    const { service } = setup({ currentGroupId: 'g9' });
    await expect(service.accept(viewer, 'p1', 'h1')).rejects.toMatchObject({ code: problemErrorCodes.handoffConflict });
  });

  it('refuses decisions on an unknown or already settled handoff', async () => {
    await expect(setup({ existingHandoff: null }).service.accept(viewer, 'p1', 'h1')).rejects.toMatchObject({ code: problemErrorCodes.handoffNotFound });
    await expect(setup({ decidedCount: 0 }).service.accept(viewer, 'p1', 'h1')).rejects.toMatchObject({ code: problemErrorCodes.handoffNotFound });
  });

  it('reject keeps the problem and returns the reason to the requester', async () => {
    const { service, prisma, notifier, handoffUpdates, events } = setup({});
    await service.reject(viewer, 'p1', 'h1', { reason: 'Nije naša domena' });

    expect(handoffUpdates[0]).toMatchObject({ status: 'REJECTED', decisionReason: 'Nije naša domena' });
    expect(prisma.problem.updateMany).not.toHaveBeenCalled();
    expect(events.map((event) => event.action)).toEqual(['handoff_rejected']);
    expect(notifier.handoffDecided).toHaveBeenCalledWith('p1', 'h1', 'u1', 'u1');
  });

  it('lets the requester cancel, and everyone else needs the source group', async () => {
    const own = setup({});
    await own.service.cancel(viewer, 'p1', 'h1', {});
    expect(own.handoffUpdates[0]).toMatchObject({ status: 'CANCELLED', decisionReason: 'handoff_cancelled' });
    // The manager who asked does not need the group authority of the holder.
    expect(own.access.requireGroupAuthority).not.toHaveBeenCalled();

    const other = setup({ guardFails: true });
    await expect(other.service.cancel({ userId: 'u2' } as never, 'p1', 'h1', { reason: 'Pogrešna grupa' })).rejects.toMatchObject({
      code: problemErrorCodes.forbidden,
    });
    expect(other.handoffUpdates).toHaveLength(0);
  });
});

describe('ProblemHandoffService history', () => {
  it('lists the transfers of a readable problem', async () => {
    const { service, prisma } = setup({});
    const result = await service.list(viewer, 'p1');
    expect(result.items).toHaveLength(1);
    expect(prisma.problemHandoff.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { problemId: 'p1' } }));
  });

  it('renders a decision with its actor and timestamps', () => {
    const view = toProblemHandoffView({
      ...handoffRow,
      status: 'ACCEPTED',
      decidedAt: new Date('2026-11-17T12:00:00Z'),
      decidedBy: { id: 'u2', displayName: 'Marko', email: 'marko@example.com' },
    });
    expect(view).toMatchObject({
      status: 'ACCEPTED',
      decidedAt: '2026-11-17T12:00:00.000Z',
      createdAt: '2026-11-17T10:00:00.000Z',
      decidedBy: { id: 'u2' },
      toGroup: { id: 'g2', name: 'Grupa B' },
      toOrganizationalUnit: { id: 'ou2', name: 'Jedinica B' },
    });
  });
});
