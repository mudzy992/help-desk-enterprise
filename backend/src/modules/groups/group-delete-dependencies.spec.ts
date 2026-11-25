jest.mock('../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));
jest.mock('../../common/cache/scope-catalog-cache', () => ({ invalidateActorGroupsCache: jest.fn() }));
jest.mock('./record-group-change', () => ({ recordGroupChange: jest.fn().mockResolvedValue(undefined) }));
jest.mock('./load-group-record', () => ({ loadGroupRecord: jest.fn() }));

import { recordGroupChange } from './record-group-change';
import { loadGroupRecord } from './load-group-record';
import { assertGroupDeletable } from './assert-group-deletable';
import { collectGroupDeleteDependencies } from './collect-group-delete-dependencies';
import { deleteGroup } from './delete-group';
import { GroupsError } from './groups.error';
import type { GroupDeleteImpact } from './group-delete.types';

type Recorder = {
  readonly prisma: unknown;
  readonly counts: Record<string, number | ((where: unknown) => number)>;
  readonly wheres: Record<string, unknown>;
};

/**
 * W2.12 fixture: one `count` delegate per relation that points at `Group`, so a
 * test can say "this group has one on-call schedule" without a database and
 * still check the exact `where` the delete path sent.
 */
function createDependencyPrisma(
  counts: Record<string, number | ((where: unknown) => number)> = {},
): Recorder {
  const wheres: Record<string, unknown> = {};
  const delegate = (name: string) => ({
    count: jest.fn(async (args: { where?: unknown } = {}) => {
      wheres[name] = args.where;
      const fixture = counts[name];
      if (typeof fixture === 'function') {
        return fixture(args.where);
      }
      return fixture ?? 0;
    }),
  });
  const prisma = {
    group: delegate('group'),
    ticket: delegate('ticket'),
    onCallSchedule: delegate('onCallSchedule'),
    teamsGroupChannel: delegate('teamsGroupChannel'),
    responseTemplateGroup: delegate('responseTemplateGroup'),
    routingRule: delegate('routingRule'),
    problemHandoff: delegate('problemHandoff'),
    ticketParticipant: delegate('ticketParticipant'),
    problem: delegate('problem'),
    changeRequest: delegate('changeRequest'),
    notification: delegate('notification'),
    ticketConfidentialGrant: delegate('ticketConfidentialGrant'),
    knowledgeArticle: delegate('knowledgeArticle'),
    slaEscalationRule: delegate('slaEscalationRule'),
    reportSchedule: delegate('reportSchedule'),
    assetType: delegate('assetType'),
  };
  return { prisma, counts, wheres };
}

const group = {
  id: 'group-1',
  name: 'Support',
  key: 'support',
  organizationalUnitId: 'ou-1',
  isFallback: false,
  isProblemGroup: false,
  isCabGroup: false,
  members: [{ userId: 'user-1' }],
};

function impactOf(recorder: Recorder, isFallback = false): Promise<GroupDeleteImpact> {
  return collectGroupDeleteDependencies(recorder.prisma as never, {
    groupId: 'group-1',
    organizationalUnitId: 'ou-1',
    isFallback,
  });
}

describe('group delete dependency inventory (W2.12 / BA-groups-01)', () => {
  it('reports nothing for a group nobody depends on', async () => {
    const recorder = createDependencyPrisma();
    const impact = await impactOf(recorder);
    expect(impact).toEqual({ blockers: [], detached: [], cascaded: [] });
  });

  it('asks every relation exactly once, with a group-scoped predicate', async () => {
    const recorder = createDependencyPrisma();
    await impactOf(recorder, true);
    const prisma = recorder.prisma as Record<string, { count: jest.Mock }>;
    const relations = [
      'group',
      'ticket',
      'onCallSchedule',
      'teamsGroupChannel',
      'responseTemplateGroup',
      'routingRule',
      'problemHandoff',
      'ticketParticipant',
      'problem',
      'changeRequest',
      'notification',
      'ticketConfidentialGrant',
      'knowledgeArticle',
      'slaEscalationRule',
      'reportSchedule',
      'assetType',
    ];
    for (const relation of relations) {
      expect(prisma[relation].count).toHaveBeenCalled();
    }
    // Two ticket counts (open/closed), two problem counts, two change counts.
    expect(prisma.ticket.count).toHaveBeenCalledTimes(2);
    expect(prisma.problem.count).toHaveBeenCalledTimes(2);
    expect(prisma.changeRequest.count).toHaveBeenCalledTimes(2);
    expect(recorder.wheres.onCallSchedule).toEqual({ groupId: 'group-1' });
    expect(recorder.wheres.teamsGroupChannel).toEqual({ groupId: 'group-1' });
    expect(recorder.wheres.responseTemplateGroup).toEqual({ groupId: 'group-1' });
    expect(recorder.wheres.routingRule).toEqual({ groupId: 'group-1' });
    expect(recorder.wheres.problemHandoff).toEqual({ toGroupId: 'group-1' });
    expect(recorder.wheres.ticketConfidentialGrant).toEqual({ groupId: 'group-1' });
    expect(recorder.wheres.knowledgeArticle).toEqual({ ownerGroupId: 'group-1' });
    expect(recorder.wheres.slaEscalationRule).toEqual({ targetGroupId: 'group-1' });
    expect(recorder.wheres.assetType).toEqual({ routingGroupId: 'group-1' });
  });

  it.each([
    ['activeTickets', { ticket: 4 }],
    ['onCallSchedule', { onCallSchedule: 1 }],
    ['teamsChannel', { teamsGroupChannel: 1 }],
    ['responseTemplates', { responseTemplateGroup: 2 }],
    ['routingRules', { routingRule: 3 }],
    ['problemHandoffs', { problemHandoff: 1 }],
    ['openProblems', { problem: 2 }],
    ['openChanges', { changeRequest: 1 }],
    ['confidentialGrants', { ticketConfidentialGrant: 5 }],
  ])('blocks the delete when %s still holds rows', async (kind, counts) => {
    const impact = await impactOf(createDependencyPrisma(counts));
    expect(impact.blockers).toEqual([{ kind, count: Object.values(counts)[0] }]);
  });

  it('blocks the last fallback group of the unit', async () => {
    const impact = await impactOf(createDependencyPrisma({ group: 1 }), true);
    expect(impact.blockers).toEqual([{ kind: 'fallbackGroups', count: 1 }]);
  });

  it('allows a fallback group when the unit has another one', async () => {
    const impact = await impactOf(createDependencyPrisma({ group: 2 }), true);
    expect(impact.blockers).toEqual([]);
  });

  it('does not count history as a blocker, but reports it as detached', async () => {
    const impact = await impactOf(
      createDependencyPrisma({
        // Only the closed-ticket query (the one with `status.in`) sees history.
        ticket: (where) =>
          (where as { status?: { in?: unknown } }).status?.in === undefined ? 0 : 7,
        ticketParticipant: 2,
        knowledgeArticle: 3,
        slaEscalationRule: 1,
        reportSchedule: 1,
        assetType: 4,
      }),
    );
    expect(impact.blockers).toEqual([]);
    expect(impact.detached).toEqual(
      expect.arrayContaining([
        { kind: 'closedTickets', count: 7 },
        { kind: 'ticketParticipants', count: 2 },
        { kind: 'knowledgeArticles', count: 3 },
        { kind: 'slaEscalationRules', count: 1 },
        { kind: 'reportSchedules', count: 1 },
        { kind: 'assetTypes', count: 4 },
      ]),
    );
  });

  it('reports cascade-deleted notifications instead of hiding them', async () => {
    const impact = await impactOf(createDependencyPrisma({ notification: 9 }));
    expect(impact.blockers).toEqual([]);
    expect(impact.cascaded).toEqual([{ kind: 'notifications', count: 9 }]);
  });

  it('splits tickets by the closed statuses the group module already uses', async () => {
    const recorder = createDependencyPrisma();
    await impactOf(recorder);
    const prisma = recorder.prisma as Record<string, { count: jest.Mock }>;
    const [openWhere, closedWhere] = prisma.ticket.count.mock.calls.map(
      ([args]: [{ where: { status: unknown } }]) => args.where.status,
    );
    expect(openWhere).toEqual({ notIn: ['CLOSED', 'ARCHIVED'] });
    expect(closedWhere).toEqual({ in: ['CLOSED', 'ARCHIVED'] });
  });

  it('splits problems and changes by terminal status', async () => {
    const recorder = createDependencyPrisma();
    await impactOf(recorder);
    const prisma = recorder.prisma as Record<string, { count: jest.Mock }>;
    const [openProblem] = prisma.problem.count.mock.calls.map(
      ([args]: [{ where: { status: unknown } }]) => args.where.status,
    );
    const [openChange] = prisma.changeRequest.count.mock.calls.map(
      ([args]: [{ where: { status: unknown } }]) => args.where.status,
    );
    expect(openProblem).toEqual({ notIn: ['RESOLVED', 'CLOSED', 'CANCELLED'] });
    expect(openChange).toEqual({ notIn: ['CLOSED', 'REJECTED', 'CANCELLED'] });
  });

  it('refuses with every blocker, not only the first one', async () => {
    const recorder = createDependencyPrisma({
      onCallSchedule: 1,
      routingRule: 2,
      ticketConfidentialGrant: 1,
    });
    const error = await assertGroupDeletable(recorder.prisma as never, group as never).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(GroupsError);
    expect((error as GroupsError).code).toBe('HAS_DEPENDENCIES');
    expect((error as GroupsError).blockers).toEqual([
      { kind: 'onCallSchedule', count: 1 },
      { kind: 'routingRules', count: 2 },
      { kind: 'confidentialGrants', count: 1 },
    ]);
  });

  it('returns the impact when the delete is allowed', async () => {
    const recorder = createDependencyPrisma({ notification: 1 });
    const impact = await assertGroupDeletable(recorder.prisma as never, group as never);
    expect(impact.cascaded).toEqual([{ kind: 'notifications', count: 1 }]);
  });
});

describe('deleteGroup audits and refuses on dependencies (W2.12)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(loadGroupRecord).mockResolvedValue(group as never);
  });

  function createTransaction(counters: Record<string, number> = {}) {
    const recorder = createDependencyPrisma(counters);
    return {
      ...(recorder.prisma as Record<string, unknown>),
      group: {
        count: (recorder.prisma as { group: { count: jest.Mock } }).group.count,
        delete: jest.fn().mockResolvedValue({}),
      },
      $executeRaw: jest.fn().mockResolvedValue(0),
      _wheres: recorder.wheres,
    };
  }

  it('does not delete or audit when a blocker exists', async () => {
    const transaction = createTransaction({ onCallSchedule: 1 });
    const prisma = {
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(transaction)),
    };
    await expect(deleteGroup(prisma as never, 'group-1')).rejects.toMatchObject({
      code: 'HAS_DEPENDENCIES',
    });
    expect(recordGroupChange).not.toHaveBeenCalled();
    expect(transaction.group.delete).not.toHaveBeenCalled();
  });

  it('records detached and cascaded rows in the audit before deleting', async () => {
    const transaction = createTransaction({ ticketParticipant: 2, notification: 3 });
    const prisma = {
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(transaction)),
    };
    const outcome = await deleteGroup(prisma as never, 'group-1');
    expect(recordGroupChange).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        metadata: expect.objectContaining({
          dependencies: {
            blocked: [],
            detached: [{ kind: 'ticketParticipants', count: 2 }],
            cascaded: [{ kind: 'notifications', count: 3 }],
          },
        }),
      }),
    );
    expect(outcome).toEqual({
      affectedUserIds: ['user-1'],
      organizationalUnitId: 'ou-1',
      impact: {
        blockers: [],
        detached: [{ kind: 'ticketParticipants', count: 2 }],
        cascaded: [{ kind: 'notifications', count: 3 }],
      },
    });
  });
});
