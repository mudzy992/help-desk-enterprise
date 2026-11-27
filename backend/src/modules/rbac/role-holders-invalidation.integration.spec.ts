import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { CacheInvalidationService } from '../../common/cache-invalidation/cache-invalidation.service';
import { TransactionalOutboxService } from '../../common/outbox/transactional-outbox.service';
import type { PrismaService } from '../../common/prisma/prisma.service';
import {
  principalContextCacheKey,
  principalContextVersionKey,
} from '../../common/principal-context/principal-context.cache';
import { PrincipalContextInvalidator } from '../../common/principal-context/principal-context-invalidator.service';
import { PrincipalContextLoader } from '../../common/principal-context/principal-context.loader';
import type { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { createAuthorizationContext } from '../authorization/create-authorization-context';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { permissionKeys } from '../authorization/authorization.constants';
import { ShadowAuthorizationService } from '../authorization/shadow-authorization.service';
import type { JwtSigningSecretLoader } from '../authentication/jwt-signing-secret.loader';
import { auditLogEntityTypes } from '../audit-log/audit-log.constants';
import { RoleHoldersInvalidationDispatcher } from './role-holders-invalidation.dispatcher';
import { roleHoldersInvalidationNamespace } from './role-holders-invalidation';
import { RolesService } from './roles.service';

/*
  W2.32 (`BA-rbac-05`): the invalidation of a role's holders used to happen only
  after the commit, through an optional hook that swallowed every error. If Redis
  or the hook failed, the API still answered 200 and the holder kept the removed
  permission until the cache TTL ran out.

  This file proves the replacement on real PostgreSQL and a real outbox:

  - the `authzVersion` fence is committed **inside** the role write, so a cache
    payload that was never tombstoned is still refused by the loader;
  - the "drop the holders" intent is a durable outbox row committed with the
    write, retried after an unreachable Redis, and never a second bump;
  - the dispatcher only publishes what the database already decided.
*/
const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

type RedisEntries = Map<string, string>;

function createFakeRedis(entries: RedisEntries, options: { broken?: boolean } = {}) {
  const publications: string[] = [];
  return {
    status: 'ready',
    connect: async () => undefined,
    get: async (key: string) => {
      if (options.broken === true) throw new Error('redis_unavailable');
      return entries.get(key) ?? null;
    },
    set: async (
      key: string,
      value: string,
      _mode: 'EX',
      _ttl: number,
      nx?: 'NX',
    ) => {
      if (options.broken === true) throw new Error('redis_unavailable');
      if (nx === 'NX' && entries.has(key)) return null;
      entries.set(key, value);
      return 'OK';
    },
    del: async (key: string) => entries.delete(key),
    publish: async (_channel: string, message: string) => {
      publications.push(message);
      return 1;
    },
    publications,
  };
}

describeIfDatabase('role holder invalidation (integration)', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient | undefined;
  const suffix = `${process.pid}-${Date.now()}`;
  const roleKey = `IT_INVAL_${suffix}`;
  const userEmail = `it-inval-${suffix}@example.invalid`;
  const topic = `cache.invalidate.${roleHoldersInvalidationNamespace}`;
  const usedPermissionKeys = [
    permissionKeys.ticketMerge,
    permissionKeys.settingsWrite,
  ];
  const createdPermissionKeys: string[] = [];
  let roleId = '';
  let userId = '';
  let cacheInvalidation: CacheInvalidationService;

  const previewSigningSecret = 'it-preview-signing-secret-value-0123456789';

  function database(): PrismaClient {
    if (prisma === undefined) {
      throw new Error('integration Prisma client was not initialized');
    }
    return prisma;
  }

  function permissionKeysOf(
    context: { assignments: readonly { permissionKeys: readonly string[] }[] } | null,
  ): readonly string[] {
    return (context?.assignments ?? []).flatMap(
      (assignment) => assignment.permissionKeys,
    );
  }

  /**
   * A context loader in the shape of `PrincipalContextLoader`, read from the
   * rows. The preview asks it for each affected assignment, so it must answer
   * with the real role permission set — a stub that returns `undefined` would
   * make the evaluator deny before the scenario even starts.
   */
  async function loadBySubjectId(subjectId: string): Promise<AuthorizationContext | null> {
    const user = await database().user.findUnique({
      where: { id: subjectId },
      select: {
        id: true,
        isActive: true,
        isLocalOnly: true,
        entraObjectId: true,
        directoryObjectGuid: true,
        userRoles: {
          select: {
            organizationalUnitId: true,
            serviceId: true,
            organizationalUnit: { select: { ouPath: true } },
            service: { select: { id: true } },
            role: {
              select: {
                key: true,
                rolePermissions: {
                  select: { permission: { select: { key: true } } },
                },
              },
            },
          },
        },
      },
    });
    if (user === null) return null;
    return createAuthorizationContext({
      id: user.id,
      isActive: user.isActive,
      isLocalOnly: user.isLocalOnly,
      entraObjectId: user.entraObjectId,
      directoryObjectGuid: user.directoryObjectGuid,
      assignments: user.userRoles.map((row) => ({
        roleKey: row.role.key,
        permissionKeys: row.role.rolePermissions.map(
          (entry) => entry.permission.key,
        ),
        organizationalUnitId: row.organizationalUnitId,
        organizationalUnitPath: row.organizationalUnit?.ouPath ?? null,
        serviceId: row.service?.id ?? null,
      })),
    });
  }

  async function outboxRows() {
    return database().outboxMessage.findMany({
      where: { topic },
      select: {
        status: true,
        attempts: true,
        payload: true,
        lastError: true,
      },
    });
  }

  async function authzVersion(): Promise<number> {
    const row = await database().user.findUniqueOrThrow({
      where: { id: userId },
      select: { authzVersion: true },
    });
    return row.authzVersion;
  }

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    for (const key of usedPermissionKeys) {
      const existing = await database().permission.findUnique({ where: { key } });
      if (existing === null) {
        await database().permission.create({
          data: { key, description: `IT ${key}` },
        });
        createdPermissionKeys.push(key);
      }
    }
    const role = await database().role.create({
      data: { key: roleKey, name: `IT invalidation role ${suffix}` },
    });
    roleId = role.id;
    const basePermission = await database().permission.findUniqueOrThrow({
      where: { key: permissionKeys.ticketMerge },
    });
    await database().rolePermission.create({
      data: { roleId, permissionId: basePermission.id },
    });
    const user = await database().user.create({
      data: { email: userEmail, displayName: 'IT invalidation holder' },
    });
    userId = user.id;
    await database().userRole.create({ data: { userId, roleId } });

    const outbox = new TransactionalOutboxService(
      prisma as unknown as PrismaService,
    );
    cacheInvalidation = new CacheInvalidationService(outbox);
  });

  afterAll(async () => {
    const db = prisma;
    if (db === undefined) return;
    await db.outboxMessage.deleteMany({ where: { topic } });
    await db.auditLog.deleteMany({
      where: { entityId: roleKey, entityType: auditLogEntityTypes.role },
    });
    await db.rolePermissionPreviewClaim.deleteMany({ where: { roleKey } });
    if (userId !== '') await db.user.delete({ where: { id: userId } });
    if (roleId !== '') await db.role.delete({ where: { id: roleId } });
    if (createdPermissionKeys.length > 0) {
      await db.permission.deleteMany({
        where: { key: { in: createdPermissionKeys }, rolePermissions: { none: {} } },
      });
    }
    await db.$disconnect();
  });

  it('keeps a removed permission gone even when the cache notice fails, then retries it', async () => {
    const entries: RedisEntries = new Map();
    const sharedCache = createFakeRedis(entries);

    // Replica A fills the shared cache with the permission that is about to go.
    const replicaA = new PrincipalContextLoader(
      prisma as never,
      sharedCache as never,
    );
    const before = await replicaA.load(userId);
    expect(permissionKeysOf(before)).toContain(permissionKeys.ticketMerge);
    const versionBefore = before?.authzVersion ?? (await authzVersion());
    expect(entries.has(principalContextCacheKey(userId, versionBefore))).toBe(
      true,
    );

    // The write commits while the cache cannot be told about it.
    const failingNotice = jest
      .fn()
      .mockRejectedValue(new Error('redis_unavailable'));
    const loader = { loadBySubjectId } as unknown as AuthorizationContextLoader;
    const service = new RolesService(
      prisma as unknown as PrismaService,
      loader,
      new ShadowAuthorizationService(
        loader,
        prisma as unknown as PrismaService,
      ),
      { publishCommittedRoleHolders: failingNotice } as never,
      { load: async () => previewSigningSecret } as unknown as JwtSigningSecretLoader,
      cacheInvalidation,
    );

    const preview = await service.preview(roleKey, [], 'super-1');
    await expect(
      service.replace({
        roleKey,
        permissionKeys: [],
        previewToken: preview.previewToken,
        reason: 'IT: provjera durable invalidacije',
        actorUserId: 'super-1',
        requestId: 'it-invalidation-1',
      }),
    ).resolves.toEqual([]);

    // 1. The fence is part of the committed write.
    const versionAfter = await authzVersion();
    expect(versionAfter).toBe(versionBefore + 1);

    // 2. The intent to drop the cached contexts is durable and committed too.
    const pending = await outboxRows();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.status).toBe('PENDING');
    expect(pending[0]?.attempts).toBe(0);
    expect(pending[0]?.payload).toMatchObject({
      namespace: roleHoldersInvalidationNamespace,
      key: roleId,
      revision: versionAfter,
    });

    // 3. The stale payload is still in Redis and was never tombstoned — the
    //    database fence alone has to make it unreachable.
    expect(entries.has(principalContextCacheKey(userId, versionBefore))).toBe(
      true,
    );
    const replicaB = new PrincipalContextLoader(
      prisma as never,
      sharedCache as never,
    );
    const afterFailure = await replicaB.load(userId);
    expect(permissionKeysOf(afterFailure)).not.toContain(
      permissionKeys.ticketMerge,
    );
    expect(afterFailure?.authzVersion).toBe(versionAfter);

    // 4. A delivery against a broken Redis is a retry, not a success.
    const brokenRedis = createFakeRedis(new Map(), { broken: true });
    const brokenDispatcher = new RoleHoldersInvalidationDispatcher(
      cacheInvalidation,
      new PrincipalContextInvalidator(
        prisma as unknown as PrismaService,
        brokenRedis as never,
      ),
    );
    await brokenDispatcher.drain();
    const retried = await outboxRows();
    expect(retried[0]?.status).toBe('PENDING');
    expect(retried[0]?.attempts).toBe(1);
    expect(retried[0]?.lastError ?? '').toContain('unavailable');

    // 5. Once Redis answers, the retry moves the pointer to the committed
    //    version — without a second bump, so the fence never widens. The failed
    //    attempt pushed `nextAttemptAt` into the backoff window; the test moves
    //    the clock past it instead of waiting for it.
    await database().outboxMessage.updateMany({
      where: { topic },
      data: { nextAttemptAt: new Date(Date.now() - 60_000) },
    });
    const healthyRedis = createFakeRedis(entries);
    const dispatcher = new RoleHoldersInvalidationDispatcher(
      cacheInvalidation,
      new PrincipalContextInvalidator(
        prisma as unknown as PrismaService,
        healthyRedis as never,
      ),
    );
    await dispatcher.drain();
    const delivered = await outboxRows();
    expect(delivered[0]?.status).toBe('SUCCEEDED');
    expect(entries.get(principalContextVersionKey(userId))).toBe(
      String(versionAfter),
    );
    expect(await authzVersion()).toBe(versionAfter);
    expect(healthyRedis.publications.length).toBeGreaterThan(0);
  });
});
