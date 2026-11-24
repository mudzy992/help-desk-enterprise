import { runWithRequestId } from '../request-context/request-context.storage';
import {
  bumpOrganizationalUnitCatalogRevision,
  invalidateOrganizationalUnitScopeCache,
  loadCachedOrganizationalUnitPath,
  loadOrganizationalUnitScopeRows,
  readOrganizationalUnitCatalogRevision,
} from './scope-catalog-cache';

/**
 * W2.11 (`BA-organizational-units-02`): the process cache used to be invalidated
 * only where the write happened. These tests model two instances as two Prisma
 * client objects (the cache is a WeakMap keyed by client) over one "database"
 * object, which is exactly the shape the bug needed.
 */
type Row = { readonly id: string; readonly ouPath: string };

function createDatabase(input: { readonly revision?: bigint } = {}) {
  return {
    rows: [] as Row[],
    revision: input.revision ?? 1n,
    revisionReads: 0,
    revisionFailure: false as boolean,
  };
}

function createClient(
  database: ReturnType<typeof createDatabase>,
  options: { readonly withRevision?: boolean } = {},
) {
  const findMany = jest.fn(async () => database.rows.map((row) => ({ ...row })));
  const findUnique = jest.fn(async () => {
    database.revisionReads += 1;
    if (database.revisionFailure) {
      throw new Error('revision read failed');
    }
    return { revision: database.revision };
  });
  const upsert = jest.fn(async () => {
    database.revision += 1n;
    return { revision: database.revision };
  });
  const client = {
    organizationalUnit: { findMany },
    ...(options.withRevision === false
      ? {}
      : { organizationalUnitCatalogRevision: { findUnique, upsert } }),
  };
  return { client, findMany, findUnique, upsert };
}

const withRequest = <T>(run: () => Promise<T>): Promise<T> =>
  runWithRequestId('w2-11-request', run);

describe('scope catalogue revision (W2.11)', () => {
  afterEach(() => {
    invalidateOrganizationalUnitScopeCache();
  });

  it('serves a cached snapshot while the shared revision still matches', async () => {
    const database = createDatabase();
    database.rows = [{ id: 'ou-a', ouPath: 'OU=A' }];
    const { client, findMany } = createClient(database);

    await withRequest(async () => {
      expect(await loadCachedOrganizationalUnitPath(client as never, 'ou-a')).toBe('OU=A');
      expect(await loadCachedOrganizationalUnitPath(client as never, 'ou-a')).toBe('OU=A');
    });

    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('reloads on the next request after another instance bumps the revision', async () => {
    const database = createDatabase();
    database.rows = [{ id: 'ou-a', ouPath: 'OU=A' }];
    // Instance B holds its own bucket: same database, different Prisma client.
    const instanceA = createClient(database);
    const instanceB = createClient(database);

    // B warms its cache from the old topology.
    await withRequest(() => loadCachedOrganizationalUnitPath(instanceB.client as never, 'ou-a'));

    // A reparents the subtree: row rewritten, revision bumped in the same commit.
    database.rows = [{ id: 'ou-a', ouPath: 'OU=B/A' }];
    await bumpOrganizationalUnitCatalogRevision(instanceA.client as never);

    // B has not been invalidated locally and its TTL has not elapsed.
    expect(await withRequest(() => loadCachedOrganizationalUnitPath(instanceB.client as never, 'ou-a'))).toBe(
      'OU=B/A',
    );
    expect(instanceB.findMany).toHaveBeenCalledTimes(2);
  });

  it('never serves a snapshot when the revision cannot be read', async () => {
    const database = createDatabase();
    database.rows = [{ id: 'ou-a', ouPath: 'OU=A' }];
    const { client, findMany } = createClient(database);

    await withRequest(() => loadCachedOrganizationalUnitPath(client as never, 'ou-a'));
    database.revisionFailure = true;
    database.rows = [{ id: 'ou-a', ouPath: 'OU=C/A' }];

    expect(await withRequest(() => loadCachedOrganizationalUnitPath(client as never, 'ou-a'))).toBe(
      'OU=C/A',
    );
    // Fail-closed: the stale snapshot is dropped, and the read is not cached.
    expect(findMany).toHaveBeenCalledTimes(2);
    await withRequest(() => loadCachedOrganizationalUnitPath(client as never, 'ou-a'));
    expect(findMany).toHaveBeenCalledTimes(3);
  });

  it('does not cache at all when the client has no revision delegate', async () => {
    const database = createDatabase();
    database.rows = [{ id: 'ou-a', ouPath: 'OU=A' }];
    const { client, findMany } = createClient(database, { withRevision: false });

    await withRequest(() => loadCachedOrganizationalUnitPath(client as never, 'ou-a'));
    await withRequest(() => loadCachedOrganizationalUnitPath(client as never, 'ou-a'));

    expect(findMany).toHaveBeenCalledTimes(2);
  });

  it('keeps the uncached read for workers, boot and scripts', async () => {
    const database = createDatabase();
    database.rows = [{ id: 'ou-a', ouPath: 'OU=A' }];
    const { client, findMany, findUnique } = createClient(database);

    await loadOrganizationalUnitScopeRows(client as never);
    await loadOrganizationalUnitScopeRows(client as never);

    expect(findMany).toHaveBeenCalledTimes(2);
    // No request id: the revision is not even asked for.
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('drops the local snapshot immediately after a write', async () => {
    const database = createDatabase();
    database.rows = [{ id: 'ou-a', ouPath: 'OU=A' }];
    const { client, findMany } = createClient(database);

    await withRequest(() => loadCachedOrganizationalUnitPath(client as never, 'ou-a'));
    database.rows = [{ id: 'ou-a', ouPath: 'OU=A/IT' }];
    invalidateOrganizationalUnitScopeCache();

    expect(await withRequest(() => loadCachedOrganizationalUnitPath(client as never, 'ou-a'))).toBe(
      'OU=A/IT',
    );
    expect(findMany).toHaveBeenCalledTimes(2);
  });

  it('bumps one singleton row atomically', async () => {
    const database = createDatabase({ revision: 4n });
    const { client, upsert } = createClient(database);

    await bumpOrganizationalUnitCatalogRevision(client as never);

    expect(upsert).toHaveBeenCalledWith({
      where: { id: 1 },
      create: { id: 1, revision: 1n },
      update: { revision: { increment: 1n } },
    });
  });

  it('reads a missing revision row as zero, not as "no data"', async () => {
    await expect(
      readOrganizationalUnitCatalogRevision({
        organizationalUnitCatalogRevision: {
          findUnique: async () => null,
        },
      } as never),
    ).resolves.toBe(0n);
  });

  it('treats an absent revision delegate as unreadable', async () => {
    await expect(readOrganizationalUnitCatalogRevision({} as never)).rejects.toThrow(
      /catalogue revision is unavailable/,
    );
  });
});
