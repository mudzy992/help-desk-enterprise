import { cabVotersMax, loadCabVoterIds } from './load-cab-voters';
import { changeErrorCodes, changeLimits } from './changes.constants';

type FindArgs = {
  readonly where: Record<string, unknown> & { id?: { gt?: string } };
  readonly take: number;
  readonly orderBy: { id: 'asc' };
};

type VoterRow = { readonly id: string };

/**
 * A fake `user.findMany` that behaves like the database: it applies the `id >`
 * keyset cursor, honours `take` and returns rows in `id asc`. The real query keeps
 * the eligibility predicate; here the roster *is* the eligible set.
 */
function roster(count: number) {
  const ids = Array.from({ length: count }, (_, index) => `u${String(index + 1).padStart(4, '0')}`);
  const calls: FindArgs[] = [];
  const findMany = jest.fn(async (args: FindArgs): Promise<VoterRow[]> => {
    calls.push(args);
    const after = args.where.id?.gt;
    const remaining = after === undefined ? ids : ids.filter((id) => id > after);
    return remaining.slice(0, args.take).map((id) => ({ id }));
  });
  return { ids, calls, findMany };
}

function prismaWith(findMany: jest.Mock): never {
  return { user: { findMany } } as never;
}

describe('loadCabVoterIds (W7.70 / BA-changes-14)', () => {
  it('reads past one page instead of stopping at a hundred voters', async () => {
    const { ids, calls, findMany } = roster(150);

    const voters = await loadCabVoterIds(prismaWith(findMany), 'cab-1');

    // The finding: 150 eligible members used to arrive as 100 → quorum computed
    // from the wrong denominator.
    expect(voters).toHaveLength(150);
    expect(voters).toEqual(ids);
    // Two pages: 100 + 50, each asking for page size + 1 to prove more data.
    expect(calls.map((call) => call.take)).toEqual([
      changeLimits.cabVoterPageSize + 1,
      changeLimits.cabVoterPageSize + 1,
    ]);
    expect(calls[0]?.where.id).toBeUndefined();
    expect(calls[1]?.where.id).toEqual({ gt: ids[99] });
    expect(calls.every((call) => call.orderBy.id === 'asc')).toBe(true);
  });

  it('keeps the eligibility predicate in the database', async () => {
    const { findMany } = roster(3);

    await loadCabVoterIds(prismaWith(findMany), 'cab-1');

    const where = (findMany.mock.calls[0]?.[0] as FindArgs).where as Record<string, unknown>;
    expect(where).toMatchObject({
      isActive: true,
      anonymizedAt: null,
      groupMembers: { some: { groupId: 'cab-1' } },
    });
    expect(where.userRoles).toEqual({
      some: { role: { rolePermissions: { some: { permission: { key: 'change.approve' } } } } },
    });
  });

  it('stops reading at an empty page without looping', async () => {
    const findMany = jest.fn(async (): Promise<VoterRow[]> => []);
    await expect(loadCabVoterIds(prismaWith(findMany), 'cab-1')).resolves.toEqual([]);
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('refuses a group above the ceiling instead of truncating the quorum', async () => {
    const { findMany } = roster(cabVotersMax + 1);

    await expect(loadCabVoterIds(prismaWith(findMany), 'cab-1')).rejects.toMatchObject({
      code: changeErrorCodes.cabGroupTooLarge,
      // The detail names the group so the operator knows which CAB to shrink.
      detail: 'cab-1',
    });
  });

  it('accepts a group exactly at the ceiling', async () => {
    const { findMany } = roster(cabVotersMax);
    await expect(loadCabVoterIds(prismaWith(findMany), 'cab-1')).resolves.toHaveLength(cabVotersMax);
  });
});
