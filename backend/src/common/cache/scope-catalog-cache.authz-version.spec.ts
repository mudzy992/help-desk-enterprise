import { publishActorAuthzVersion } from '../request-context/authz-version-probe';
import { runWithRequestId } from '../request-context/request-context.storage';
import {
  invalidateActorGroupsCache,
  loadActorGroupMemberships,
} from './scope-catalog-cache';

/**
 * W2.25 (`BA-groups-02`): the actor-group snapshot is cached per process for 30 s.
 * Before this package an instance that did not handle the membership write kept
 * serving the removed group from that snapshot — the finding's "up to 30 s".
 *
 * Two instances are modelled the way the bug needed them: two Prisma client
 * objects (the cache is a `WeakMap` keyed by client) over one "database".
 * `User.authzVersion` is the revision: it is bumped inside the membership
 * transaction and arrives in the request scope with the session read, so the check
 * costs no extra statement.
 */
type Membership = { readonly id: string; readonly groupId: string; readonly createdAt: Date };

function createDatabase() {
  return {
    memberships: new Map<string, Membership[]>(),
    authzVersions: new Map<string, number>(),
    reads: 0,
  };
}

function createClient(database: ReturnType<typeof createDatabase>) {
  const findMany = jest.fn(async ({ where }: { where: { userId: string } }) => {
    database.reads += 1;
    return [...(database.memberships.get(where.userId) ?? [])];
  });
  return { client: { groupMember: { findMany } }, findMany };
}

const withRequest = <T>(name: string, run: () => Promise<T>): Promise<T> =>
  runWithRequestId(name, run);

describe('actor group snapshot revision (W2.25)', () => {
  afterEach(() => {
    invalidateActorGroupsCache();
  });

  it('serves the snapshot while the actor authzVersion still matches', async () => {
    const database = createDatabase();
    database.memberships.set('user-1', [
      { id: 'membership-1', groupId: 'group-1', createdAt: new Date('2026-01-01T00:00:00.000Z') },
    ]);
    const { client, findMany } = createClient(database);

    const groups = await withRequest('request-1', async () => {
      publishActorAuthzVersion(4);
      const first = await loadActorGroupMemberships(client as never, 'user-1');
      const second = await loadActorGroupMemberships(client as never, 'user-1');
      expect(second).toBe(first);
      return first;
    });

    expect(groups.map((group) => group.groupId)).toEqual(['group-1']);
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('never serves a stale snapshot after another instance commits a revoke', async () => {
    const database = createDatabase();
    database.memberships.set('user-1', [
      { id: 'membership-1', groupId: 'group-1', createdAt: new Date('2026-01-01T00:00:00.000Z') },
    ]);
    // Instance A handled the write and owns the warm cache; instance B is a second
    // process with its own Prisma client and its own (also warm) snapshot.
    const instanceA = createClient(database);
    const instanceB = createClient(database);

    await withRequest('instance-a-warm', async () => {
      publishActorAuthzVersion(4);
      await loadActorGroupMemberships(instanceA.client as never, 'user-1');
      await loadActorGroupMemberships(instanceB.client as never, 'user-1');
    });
    expect(instanceA.findMany).toHaveBeenCalledTimes(1);
    expect(instanceB.findMany).toHaveBeenCalledTimes(1);

    // `removeGroupMember`: membership row deleted + authzVersion bumped in one commit.
    database.memberships.set('user-1', []);
    database.authzVersions.set('user-1', 5);

    // The first request on the other instance after the commit, with the version
    // the durable session read carries. No local invalidation happened there.
    const after = await withRequest('instance-b-after-revoke', async () => {
      publishActorAuthzVersion(5);
      return loadActorGroupMemberships(instanceB.client as never, 'user-1');
    });

    expect(after).toEqual([]);
    expect(instanceB.findMany).toHaveBeenCalledTimes(2);
  });

  it('does not cache when the request carries no authzVersion', async () => {
    const database = createDatabase();
    database.memberships.set('user-1', [
      { id: 'membership-1', groupId: 'group-1', createdAt: new Date('2026-01-01T00:00:00.000Z') },
    ]);
    const { client, findMany } = createClient(database);

    await withRequest('no-version', async () => {
      await loadActorGroupMemberships(client as never, 'user-1');
      await loadActorGroupMemberships(client as never, 'user-1');
    });

    // Freshness cannot be proven, so the authority is read every time.
    expect(findMany).toHaveBeenCalledTimes(2);
  });

  it('keeps the uncached read for workers, sockets and scripts', async () => {
    const database = createDatabase();
    database.memberships.set('user-1', []);
    const { client, findMany } = createClient(database);

    // No request scope at all: a publish would be a no-op and the cache is skipped.
    publishActorAuthzVersion(9);
    await loadActorGroupMemberships(client as never, 'user-1');
    await loadActorGroupMemberships(client as never, 'user-1');

    expect(findMany).toHaveBeenCalledTimes(2);
  });

  it('drops the local snapshot immediately after a write', async () => {
    const database = createDatabase();
    database.memberships.set('user-1', [
      { id: 'membership-1', groupId: 'group-1', createdAt: new Date('2026-01-01T00:00:00.000Z') },
    ]);
    const { client, findMany } = createClient(database);

    await withRequest('local-write', async () => {
      publishActorAuthzVersion(4);
      await loadActorGroupMemberships(client as never, 'user-1');
      database.memberships.set('user-1', []);
      invalidateActorGroupsCache();
      publishActorAuthzVersion(5);
      expect(await loadActorGroupMemberships(client as never, 'user-1')).toEqual([]);
    });

    expect(findMany).toHaveBeenCalledTimes(2);
  });

  it('cannot be poisoned by a late read that started before an invalidation', async () => {
    const database = createDatabase();
    database.memberships.set('user-1', [
      { id: 'membership-1', groupId: 'group-1', createdAt: new Date('2026-01-01T00:00:00.000Z') },
    ]);
    const { client } = createClient(database);

    await withRequest('late-read', async () => {
      publishActorAuthzVersion(4);
      const inFlight = loadActorGroupMemberships(client as never, 'user-1');
      database.memberships.set('user-1', []);
      invalidateActorGroupsCache();
      // A read that started before the write resolves the way it resolves; what
      // matters is that whatever it stored is not used afterwards.
      await inFlight;
    });

    // … but the entry it stored is never served: the next request carries the new
    // version, so the snapshot no longer matches.
    expect(
      await withRequest('after-late-read', async () => {
        publishActorAuthzVersion(5);
        return loadActorGroupMemberships(client as never, 'user-1');
      }),
    ).toEqual([]);
  });
});
