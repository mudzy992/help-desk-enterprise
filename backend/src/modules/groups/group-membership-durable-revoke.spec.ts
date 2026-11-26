import { addGroupMember } from './add-group-member';
import { recordGroupChange } from './record-group-change';
import { removeGroupMember } from './remove-group-member';
import { groupRoomRevokeTopic } from './group-room-revoke.outbox';

jest.mock('./record-group-change', () => ({ recordGroupChange: jest.fn(async () => undefined) }));

/*
  W2.25 (`BA-groups-02`): what a membership write must do **inside its own
  transaction**, in order:

    1. the membership row changes;
    2. the audit entry is appended;
    3. the member's `User.authzVersion` is bumped (the fence the HTTP request path
       validates a cached snapshot against);
    4. a removal also commits the intent to drop the group room (durable revoke).

  The hook that runs afterwards may only *publish* what was committed — a second
  bump would reopen the window the commit closed. A failure anywhere in the
  transaction must leave nothing behind: no membership, no bump, no revoke intent.
*/
type Call = string;

/*
  The audit append itself (hash chain, advisory locks, allowlisted metadata) is
  covered by its own suite; here it is a step whose position and failure matter.
*/
const auditStep = recordGroupChange as unknown as jest.Mock;

function harness(options: { failAudit?: boolean; failMembership?: boolean; existing?: boolean } = {}) {
  const calls: Call[] = [];
  let committedVersion: number | undefined;
  auditStep.mockImplementation(async () => {
    if (options.failAudit === true) throw new Error('audit insert failed');
    calls.push('audit');
    return undefined;
  });

  const transaction = {
    groupMember: {
      create: jest.fn(async () => {
        if (options.failMembership === true) throw new Error('membership write failed');
        calls.push('membership');
        return { id: 'member-1' };
      }),
      delete: jest.fn(async () => {
        calls.push('membership');
        return { id: 'member-1' };
      }),
    },
    user: {
      update: jest.fn(async ({ data }: { data: { authzVersion: { increment: number } } }) => {
        calls.push('authz-version');
        committedVersion = 3 + data.authzVersion.increment;
        return { authzVersion: committedVersion };
      }),
    },
  };

  const prisma = {
    group: {
      findUnique: jest.fn(async () => ({
        id: 'group-1',
        name: 'Service desk',
        key: 'SD',
        organizationalUnitId: 'ou-1',
        organizationalUnit: { id: 'ou-1', ouPath: 'OU=IT', name: 'IT' },
        isFallback: false,
        isProblemGroup: false,
        isCabGroup: false,
        members: [],
        _count: { members: 0 },
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      })),
    },
    groupMember: {
      findUnique: jest.fn(async () => (options.existing === false ? null : { id: 'member-1' })),
    },
    user: { findUnique: jest.fn(async () => ({ id: 'user-1' })) },
    $executeRaw: jest.fn(async () => 1),
    $transaction: jest.fn(async (run: (client: unknown) => Promise<unknown>) => {
      const before = [...calls];
      try {
        const result = await run(transaction);
        calls.push('commit');
        return result;
      } catch (error) {
        calls.length = 0;
        calls.push(...before, 'rollback');
        throw error;
      }
    }),
  };

  const enqueue = jest.fn(
    async (
      _transaction: unknown,
      input: { topic: string; dedupeKey: string; payload: Record<string, unknown> },
    ) => {
      calls.push('revoke-intent');
      return { id: 'outbox-1', created: true, input };
    },
  );
  const invalidatePrincipal = jest.fn(async () => undefined);

  return { prisma, enqueue, invalidatePrincipal, calls, transaction };
}

describe('membership write commits its own fence (W2.25)', () => {
  it('adds the membership, bumps authzVersion and notifies with the committed version', async () => {
    const { prisma, enqueue, invalidatePrincipal, calls } = harness({ existing: false });

    await addGroupMember(
      prisma as never,
      'group-1',
      'user-1',
      invalidatePrincipal,
      { actorUserId: 'admin-1', requestId: 'req-1' },
    );

    expect(calls).toEqual(['membership', 'audit', 'authz-version', 'commit']);
    expect(invalidatePrincipal).toHaveBeenCalledWith('user-1', 4);
    // Adding a member does not revoke a room.
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('commits the removal, the fence and the durable room revoke together', async () => {
    const { prisma, enqueue, invalidatePrincipal, calls } = harness();

    await removeGroupMember(
      prisma as never,
      'group-1',
      'user-1',
      invalidatePrincipal,
      { actorUserId: 'admin-1', requestId: 'req-1' },
      { enqueue } as never,
    );

    expect(calls).toEqual(['membership', 'audit', 'authz-version', 'revoke-intent', 'commit']);
    expect(invalidatePrincipal).toHaveBeenCalledWith('user-1', 4);
    expect(enqueue).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        topic: groupRoomRevokeTopic,
        dedupeKey: 'groups.membership-revoke:group-1:user-1:4',
        payload: { subjectId: 'user-1', groupId: 'group-1', revision: 4 },
      }),
    );
  });

  it('leaves no fence and no revoke intent when the audit append fails', async () => {
    const { prisma, enqueue, invalidatePrincipal, calls } = harness({ failAudit: true });

    await expect(
      removeGroupMember(
        prisma as never,
        'group-1',
        'user-1',
        invalidatePrincipal,
        { actorUserId: 'admin-1', requestId: 'req-1' },
        { enqueue } as never,
      ),
    ).rejects.toThrow('audit insert failed');

    expect(calls).toEqual(['rollback']);
    expect(enqueue).not.toHaveBeenCalled();
    expect(invalidatePrincipal).not.toHaveBeenCalled();
  });

  it('does not notify when the membership write itself fails', async () => {
    const { prisma, enqueue, invalidatePrincipal } = harness({
      existing: false,
      failMembership: true,
    });

    await expect(
      addGroupMember(
        prisma as never,
        'group-1',
        'user-1',
        invalidatePrincipal,
        { actorUserId: null, requestId: null },
      ),
    ).rejects.toThrow('membership write failed');

    expect(invalidatePrincipal).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('works without the outbox (scripts, unit constructions) and still fences the version', async () => {
    const { prisma, invalidatePrincipal } = harness();

    await removeGroupMember(
      prisma as never,
      'group-1',
      'user-1',
      invalidatePrincipal,
      { actorUserId: null, requestId: null },
      undefined,
    );

    expect(invalidatePrincipal).toHaveBeenCalledWith('user-1', 4);
  });
});
