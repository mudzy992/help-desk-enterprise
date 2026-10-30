import type { PrincipalContext } from './principal-context.types';
import {
  invalidateCachedPrincipalContext,
  principalContextCacheKey,
  principalContextCacheTtlSeconds,
  principalContextVersionKey,
  readCachedPrincipalContext,
  writeCachedPrincipalContext,
} from './principal-context.cache';
import { mapPrincipalUser } from './load-principal-context';
import { PrincipalContextLoader } from './principal-context.loader';
import { PrincipalContextInvalidator } from './principal-context-invalidator.service';
import { runWithRequestId } from '../request-context/request-context.storage';

jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

type StoredEntry = { readonly value: string; readonly ttlSeconds: number };

function createFakeRedis() {
  const entries = new Map<string, StoredEntry>();
  const calls: string[] = [];
  const client = {
    status: 'ready',
    connect: async () => undefined,
    get: async (key: string) => {
      calls.push(`get ${key}`);
      return entries.get(key)?.value ?? null;
    },
    set: async (
      key: string,
      value: string,
      mode: 'EX',
      ttlSeconds: number,
      notExists?: 'NX',
    ) => {
      calls.push(`set ${key} ${mode} ${ttlSeconds}${notExists === 'NX' ? ' NX' : ''}`);
      if (notExists === 'NX' && entries.has(key)) {
        return null;
      }
      entries.set(key, { value, ttlSeconds });
      return 'OK';
    },
    del: async (key: string) => {
      calls.push(`del ${key}`);
      return entries.delete(key) ? 1 : 0;
    },
  };
  return { client, entries, calls };
}

/** The database row shape the loader reads, plus a query counter. */
function createFakePrisma(state: {
  users: Map<string, Record<string, unknown>>;
}) {
  const queries: string[] = [];
  const prisma = {
    user: {
      findUnique: async (args: { where: { id: string } }) => {
        queries.push(`findUnique ${args.where.id}`);
        const row = state.users.get(args.where.id);
        return row === undefined ? null : { ...row };
      },
      update: async (args: {
        where: { id: string };
        data: { authzVersion: { increment: number } };
      }) => {
        queries.push(`update ${args.where.id}`);
        const row = state.users.get(args.where.id);
        if (row === undefined) {
          throw new Error('record not found');
        }
        const next = Number(row.authzVersion ?? 0) + args.data.authzVersion.increment;
        state.users.set(args.where.id, { ...row, authzVersion: next });
        return { authzVersion: next };
      },
    },
  };
  return { prisma, queries };
}

function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-agent',
    email: 'agent@example.com',
    displayName: 'Agent',
    isActive: true,
    isLocalOnly: false,
    mustChangePassword: false,
    entraObjectId: null,
    directoryObjectGuid: null,
    authzVersion: 0,
    organizationalUnitId: 'ou-it',
    userRoles: [
      {
        id: 'assignment-agent-ou-it',
        role: {
          key: 'AGENT',
          rolePermissions: [{ permission: { key: 'ticket.merge' } }],
        },
        organizationalUnit: { id: 'ou-it', ouPath: '/Korisnici/IT' },
        service: null,
      },
    ],
    groupMembers: [{ groupId: 'group-it' }],
    ...overrides,
  };
}

function setup(seed: Record<string, unknown> = userRow()) {
  const state = { users: new Map([['user-agent', seed]]) };
  const { prisma, queries } = createFakePrisma(state);
  const redis = createFakeRedis();
  const loader = new PrincipalContextLoader(prisma as never, redis.client as never);
  const invalidator = new PrincipalContextInvalidator(
    prisma as never,
    redis.client as never,
  );
  return { loader, invalidator, state, queries, redis, prisma };
}

describe('principal context loading (phase 2.2)', () => {
  it('shares one durable authority read across guards and services per request', async () => {
    const { loader, queries } = setup();
    // Prime Redis so each call in the measured request would hit the durable
    // authority fence if request-local memoization were not in place.
    await runWithRequestId('principal-cache-prime', () => loader.load('user-agent'));
    queries.length = 0;

    await runWithRequestId('principal-request-1', async () => {
      const [guard, roleGuard, service] = await Promise.all([
        loader.load('user-agent'),
        loader.load('user-agent'),
        loader.load('user-agent'),
      ]);
      expect(guard).not.toBeNull();
      expect(roleGuard).toEqual(guard);
      expect(service).toEqual(guard);
    });
    expect(queries.filter((query) => query.startsWith('findUnique'))).toHaveLength(1);

    await runWithRequestId('principal-request-2', async () => {
      expect(await loader.load('user-agent')).not.toBeNull();
    });
    // A subsequent HTTP request still performs its own durable authority fence.
    expect(queries.filter((query) => query.startsWith('findUnique'))).toHaveLength(2);
  });

  it('shares the guard-loaded principal across loader instances in one request', async () => {
    const { loader, prisma, redis, queries } = setup();
    // Warm the payload so the second loader would otherwise perform the
    // independent user-authority query on a Redis hit.
    await loader.load('user-agent');
    queries.length = 0;
    const serviceLoader = new PrincipalContextLoader(
      prisma as never,
      redis.client as never,
    );
    const authority = {
      subjectId: 'user-agent',
      authzVersion: 0,
      isActive: true,
      mustChangePassword: false,
    } as const;

    await runWithRequestId('principal-cross-loader-request', async () => {
      const guarded = await loader.load('user-agent', authority);
      const service = await serviceLoader.load('user-agent');
      expect(service).toEqual(guarded);
    });
    expect(queries).toHaveLength(0);
  });

  it('reuses the durable session authority snapshot to fence a cache hit', async () => {
    const { loader, state, queries } = setup();
    await loader.load('user-agent');
    const authority = {
      subjectId: 'user-agent',
      authzVersion: 0,
      isActive: true,
      mustChangePassword: false,
    } as const;

    const cached = await runWithRequestId('session-authority-hit', () =>
      loader.load('user-agent', authority),
    );
    expect(cached?.roleKeys).toEqual(['AGENT']);
    expect(queries.filter((query) => query.startsWith('findUnique'))).toHaveLength(1);

    state.users.set(
      'user-agent',
      userRow({
        authzVersion: 1,
        userRoles: [
          {
            id: 'assignment-admin-ou-it',
            role: {
              key: 'ADMIN',
              rolePermissions: [{ permission: { key: 'ticket.merge' } }],
            },
            organizationalUnit: { id: 'ou-it', ouPath: '/Korisnici/IT' },
            service: null,
          },
        ],
      }),
    );
    const refreshed = await runWithRequestId('session-authority-change', () =>
      loader.load('user-agent', { ...authority, authzVersion: 1 }),
    );
    expect(refreshed?.roleKeys).toEqual(['ADMIN']);
    expect(queries.filter((query) => query.startsWith('findUnique'))).toHaveLength(2);
  });

  it('does not serve a cached principal when the joined authority snapshot denies it', async () => {
    const { loader, queries } = setup();
    await loader.load('user-agent');

    await expect(
      loader.load('user-agent', {
        subjectId: 'user-agent',
        authzVersion: 0,
        isActive: false,
        mustChangePassword: false,
      }),
    ).resolves.toBeNull();
    expect(queries.filter((query) => query.startsWith('findUnique'))).toHaveLength(1);
  });

  it('serves two consecutive requests with a single database load', async () => {
    const { loader, queries } = setup();
    const first = await loader.load('user-agent');
    const second = await loader.load('user-agent');
    expect(first).not.toBeNull();
    expect(second).toEqual(first);
    // First request loads the complete principal; a cache hit performs one
    // lightweight PostgreSQL authority fence.
    expect(queries.filter((query) => query.startsWith('findUnique'))).toHaveLength(2);
  });

  it('maps the same data the authorization context used before', async () => {
    const { loader } = setup();
    const context = await loader.load('user-agent');
    expect(context).toMatchObject({
      subjectId: 'user-agent',
      roleKeys: ['AGENT'],
      groupIds: ['group-it'],
      homeOrganizationalUnitId: 'ou-it',
      isActive: true,
      mustChangePassword: false,
      authzVersion: 0,
    });
    expect(context?.assignments).toEqual([
      {
        assignmentId: 'assignment-agent-ou-it',
        roleKey: 'AGENT',
        permissionKeys: ['ticket.merge'],
        scope: {
          kind: 'organizational-unit',
          organizationalUnitId: 'ou-it',
          organizationalUnitPath: '/Korisnici/IT',
        },
        organizationalUnitId: 'ou-it',
        organizationalUnitPath: '/Korisnici/IT',
        serviceId: null,
      },
    ]);
  });

  it('caches under the versioned key with a sixty second ttl', async () => {
    const { loader, redis } = setup();
    await loader.load('user-agent');
    expect(redis.entries.get(principalContextVersionKey('user-agent'))).toEqual({
      value: '0',
      ttlSeconds: principalContextCacheTtlSeconds,
    });
    expect(redis.entries.has(principalContextCacheKey('user-agent', 0))).toBe(true);
  });

  it('sees a role change on the very next request, before the ttl expires', async () => {
    const { loader, invalidator, state, queries } = setup();
    await loader.load('user-agent');
    // The role is granted and the cache is invalidated (what the mutation
    // hooks do).
    state.users.set(
      'user-agent',
      userRow({
        userRoles: [
          {
            id: 'assignment-admin-ou-it',
            role: {
              key: 'ADMIN',
              rolePermissions: [{ permission: { key: 'ticket.merge' } }],
            },
            organizationalUnit: { id: 'ou-it', ouPath: '/Korisnici/IT' },
            service: null,
          },
        ],
      }),
    );
    await invalidator.invalidateUser('user-agent');

    const after = await loader.load('user-agent');
    expect(after?.roleKeys).toEqual(['ADMIN']);
    expect(queries.filter((query) => query.startsWith('findUnique'))).toHaveLength(2);
  });

  it('rejects a stale cached grant when another replica commits without a Redis tombstone', async () => {
    const { loader, state } = setup();
    expect((await loader.load('user-agent'))?.roleKeys).toEqual(['AGENT']);
    state.users.set(
      'user-agent',
      userRow({
        authzVersion: 1,
        userRoles: [{
          id: 'assignment-admin-ou-it',
          role: { key: 'ADMIN', rolePermissions: [] },
          organizationalUnit: { id: 'ou-it', ouPath: '/Korisnici/IT' },
          service: null,
        }],
      }),
    );
    expect((await loader.load('user-agent'))?.roleKeys).toEqual(['ADMIN']);
  });

  it('makes deactivation visible without a successful version or Redis update', async () => {
    const { loader, state } = setup();
    expect((await loader.load('user-agent'))?.isActive).toBe(true);
    // Simulates a different API replica committing deactivation while Redis is
    // unavailable and before legacy mutation hooks have bumped authzVersion.
    state.users.set('user-agent', userRow({ isActive: false, authzVersion: 0 }));
    expect((await loader.load('user-agent'))?.isActive).toBe(false);
  });

  it('makes a deactivation visible immediately, without waiting for the ttl', async () => {
    const { loader, invalidator, state } = setup();
    expect((await loader.load('user-agent'))?.isActive).toBe(true);
    state.users.set('user-agent', userRow({ isActive: false }));
    await invalidator.invalidateUser('user-agent');
    const after = await loader.load('user-agent');
    // The guard turns "not active" into 401; the loader only has to stop
    // serving the stale, active copy.
    expect(after?.isActive).toBe(false);
  });

  it('leaves a tombstone pointer on the new version instead of the old payload', async () => {
    const { loader, invalidator, redis, state } = setup();
    await loader.load('user-agent');
    state.users.set('user-agent', userRow({ isActive: false }));
    await invalidator.invalidateUser('user-agent');
    // The pointer exists — but it points at a version with no payload, so the
    // next request cannot be served stale data by a surviving Redis.
    expect(redis.entries.get(principalContextVersionKey('user-agent'))).toEqual({
      value: '1',
      ttlSeconds: principalContextCacheTtlSeconds,
    });
    expect(redis.entries.has(principalContextCacheKey('user-agent', 1))).toBe(false);
    const after = await loader.load('user-agent');
    expect(after?.authzVersion).toBe(1);
    expect(after?.isActive).toBe(false);
  });

  it('never lets a fill that started before a mutation move the pointer back', async () => {
    const { loader, invalidator, redis, state } = setup();
    // A request read the record (version 0) but has not written the cache yet.
    const readBeforeMutation = await loader.load('user-agent');
    expect(readBeforeMutation?.authzVersion).toBe(0);
    state.users.set('user-agent', userRow({ isActive: false }));
    await invalidator.invalidateUser('user-agent');

    // The late fill tries to publish its stale payload.
    await writeCachedPrincipalContext(redis.client as never, readBeforeMutation!);
    expect(redis.entries.get(principalContextVersionKey('user-agent'))?.value).toBe('1');
    expect((await loader.load('user-agent'))?.isActive).toBe(false);
  });

  it('deletes the pointer when the version bump did not happen', async () => {
    const { loader, invalidator, redis, state } = setup();
    await loader.load('user-agent');
    state.users.delete('user-agent');
    expect(await invalidator.invalidateUser('user-agent')).toBeNull();
    expect(redis.entries.has(principalContextVersionKey('user-agent'))).toBe(false);
  });

  it('falls back to the database when Redis is down (fail-open)', async () => {
    const state = { users: new Map([['user-agent', userRow()]]) };
    const { prisma, queries } = createFakePrisma(state);
    const broken = {
      status: 'ready',
      connect: async () => undefined,
      get: async () => {
        throw new Error('redis is down');
      },
      set: async () => {
        throw new Error('redis is down');
      },
      del: async () => {
        throw new Error('redis is down');
      },
    };
    const loader = new PrincipalContextLoader(prisma as never, broken as never);
    const invalidator = new PrincipalContextInvalidator(prisma as never, broken as never);

    const first = await loader.load('user-agent');
    const second = await loader.load('user-agent');
    expect(first?.subjectId).toBe('user-agent');
    expect(second?.subjectId).toBe('user-agent');
    // Without a cache every request reads the database — slower, but correct.
    expect(queries.filter((query) => query.startsWith('findUnique'))).toHaveLength(2);

    // The invalidation still bumps the version even though the DEL failed.
    const version = await invalidator.invalidateUser('user-agent');
    expect(version).toBe(1);
  });

  it('ignores a payload that does not match the pointer or is not a context', async () => {
    const { loader, redis } = setup();
    await loader.load('user-agent');
    redis.entries.set(principalContextCacheKey('user-agent', 0), {
      value: '{"not":"a context"}',
      ttlSeconds: 60,
    });
    // A shape that cannot be trusted is a miss, not a crash.
    expect(await readCachedPrincipalContext(redis.client as never, 'user-agent')).toBeNull();
    expect((await loader.load('user-agent'))?.subjectId).toBe('user-agent');
  });

  it('misses cached contexts created before directory identity was part of the SuperAdmin invariant', async () => {
    const { loader, redis } = setup();
    await loader.load('user-agent');
    const key = principalContextCacheKey('user-agent', 0);
    const oldContext = JSON.parse(redis.entries.get(key)!.value) as Record<string, unknown>;
    delete oldContext.directoryObjectGuid;
    redis.entries.set(key, { value: JSON.stringify(oldContext), ttlSeconds: 60 });

    expect(await readCachedPrincipalContext(redis.client as never, 'user-agent')).toBeNull();
    expect((await loader.load('user-agent'))?.directoryObjectGuid).toBeNull();
  });

  it('never caches a user that does not exist', async () => {
    const { loader, redis } = setup();
    expect(await loader.load('nobody')).toBeNull();
    expect(redis.entries.size).toBe(0);
  });
});

describe('principal context cache client contract', () => {
  it('is a no-op without a client', async () => {
    const context: PrincipalContext = {
      subjectId: 'user-1',
      email: 'a@example.com',
      displayName: 'A',
      isActive: true,
      isLocalOnly: false,
      mustChangePassword: false,
      entraObjectId: null,
      directoryObjectGuid: null,
      roleKeys: [],
      groupIds: [],
      homeOrganizationalUnitId: null,
      assignments: [],
      authzVersion: 3,
    };
    expect(await readCachedPrincipalContext(null, 'user-1')).toBeNull();
    await expect(writeCachedPrincipalContext(null, context)).resolves.toBeUndefined();
    await expect(invalidateCachedPrincipalContext(null, 'user-1')).resolves.toBeUndefined();
  });

  it('reports cache miss categories to an optional observer', async () => {
    const { client } = createFakeRedis();
    const reasons: string[] = [];
    const onMiss = (reason: string) => reasons.push(reason);

    expect(await readCachedPrincipalContext(null, 'user-1', onMiss)).toBeNull();
    expect(await readCachedPrincipalContext(client, 'user-1', onMiss)).toBeNull();
    expect(reasons).toEqual(['no_client', 'no_pointer']);
  });

  it('keeps the pointer pointing at nothing after invalidation', async () => {
    const { loader, invalidator, redis } = setup();
    await loader.load('user-agent');
    await invalidator.invalidateUser('user-agent');
    expect(redis.entries.get(principalContextVersionKey('user-agent'))?.value).toBe('1');
    // Nothing resolves: the tombstone version has no payload.
    expect(await readCachedPrincipalContext(redis.client as never, 'user-agent')).toBeNull();
  });

  it('keeps the maps structurally plain so JSON round-trips', () => {
    const context = mapPrincipalUser(
      userRow() as unknown as Parameters<typeof mapPrincipalUser>[0],
    );
    expect(JSON.parse(JSON.stringify(context))).toEqual(context);
  });
});
