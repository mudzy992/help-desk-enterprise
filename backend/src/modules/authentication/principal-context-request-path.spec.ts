import { UnauthorizedException } from '@nestjs/common';
import { PrincipalContextInvalidator } from '../../common/principal-context/principal-context-invalidator.service';
import { PrincipalContextLoader } from '../../common/principal-context/principal-context.loader';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { SessionAuthenticationGuard } from './session-authentication.guard';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

/**
 * Phase 2.2 acceptance (plan §2.2 "VERIFIKACIJA"), wired the way production wires
 * it: session guard → principal context loader (Redis → database) → invalidator.
 *
 *   - two consecutive requests cost ONE database load;
 *   - a deactivated user gets 401 on the very next request;
 *   - a role change is visible on the very next request, before the TTL expires.
 */
describe('authorization request path (phase 2.2)', () => {
  function createWorld() {
    const rows = new Map<string, Record<string, unknown>>([
      ['user-1', row()],
    ]);
    const queries: string[] = [];
    const entries = new Map<string, { value: string; ttlSeconds: number }>();

    const prisma = {
      user: {
        findUnique: async (args: { where: { id: string } }) => {
          queries.push('findUnique');
          return rows.get(args.where.id) ?? null;
        },
        update: async (args: {
          where: { id: string };
          data: { authzVersion: { increment: number } };
        }) => {
          const row = rows.get(args.where.id);
          if (row === undefined) {
            throw new Error('record not found');
          }
          const authzVersion =
            Number(row.authzVersion ?? 0) + args.data.authzVersion.increment;
          rows.set(args.where.id, { ...row, authzVersion });
          return { authzVersion };
        },
      },
    };

    const redis = {
      status: 'ready',
      connect: async () => undefined,
      get: async (key: string) => entries.get(key)?.value ?? null,
      set: async (
        key: string,
        value: string,
        _mode: 'EX',
        ttlSeconds: number,
        notExists?: 'NX',
      ) => {
        if (notExists === 'NX' && entries.has(key)) {
          return null;
        }
        entries.set(key, { value, ttlSeconds });
        return 'OK';
      },
      del: async (key: string) => entries.delete(key),
    };

    const loader = new PrincipalContextLoader(prisma as never, redis as never);
    const invalidator = new PrincipalContextInvalidator(
      prisma as never,
      redis as never,
    );
    const guard = new SessionAuthenticationGuard(
      { verify: async () => ({ subjectId: 'user-1' }) } as never,
      loader,
    );
    const authorizationLoader = new AuthorizationContextLoader(
      prisma as never,
      loader,
    );

    return {
      guard,
      loader,
      invalidator,
      authorizationLoader,
      rows,
      queries,
      entries,
      databaseReads: () => queries.filter((query) => query === 'findUnique').length,
    };
  }

  function row(overrides: Record<string, unknown> = {}) {
    return {
      id: 'user-1',
      email: 'agent@example.com',
      displayName: 'Agent',
      isActive: true,
      isLocalOnly: false,
      mustChangePassword: false,
      entraObjectId: null,
      authzVersion: 0,
      organizationalUnitId: 'ou-it',
      userRoles: [
        {
          role: {
            key: 'AGENT',
            rolePermissions: [{ permission: { key: 'ticket.read' } }],
          },
          organizationalUnit: { id: 'ou-it', ouPath: '/Korisnici/IT' },
          service: null,
        },
      ],
      groupMembers: [],
      ...overrides,
    };
  }

  function request(guard: SessionAuthenticationGuard) {
    return guard.canActivate({
      switchToHttp: () => ({
        getRequest: () => ({ headers: { authorization: 'Bearer session-token' } }),
      }),
    } as never);
  }

  it('serves two requests with one database load and then sees a role change at once', async () => {
    const world = createWorld();

    await expect(request(world.guard)).resolves.toBe(true);
    await expect(request(world.guard)).resolves.toBe(true);
    expect(world.databaseReads()).toBe(1);

    const before = await world.authorizationLoader.loadBySubjectId('user-1');
    expect(before?.assignments.map((assignment) => assignment.roleKey)).toEqual([
      'AGENT',
    ]);
    // The authorization loader shares the cached load of the guard.
    expect(world.databaseReads()).toBe(1);

    // The role changes (what `assignUserRole` + the hook do).
    world.rows.set(
      'user-1',
      row({
        userRoles: [
          {
            role: {
              key: 'ADMIN',
              rolePermissions: [{ permission: { key: 'ticket.read' } }],
            },
            organizationalUnit: { id: 'ou-it', ouPath: '/Korisnici/IT' },
            service: null,
          },
        ],
      }),
    );
    await world.invalidator.invalidateUser('user-1');

    const after = await world.authorizationLoader.loadBySubjectId('user-1');
    expect(after?.assignments.map((assignment) => assignment.roleKey)).toEqual([
      'ADMIN',
    ]);
    expect(world.databaseReads()).toBe(2);
  });

  it('rejects a deactivated user on the next request, before the ttl', async () => {
    const world = createWorld();
    await expect(request(world.guard)).resolves.toBe(true);

    // Deactivation, exactly as `updateUser` does it plus the hook.
    world.rows.set('user-1', row({ isActive: false }));
    await world.invalidator.invalidateUser('user-1');

    await expect(request(world.guard)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('keeps working (single database read per request) while Redis is down', async () => {
    const world = createWorld();
    const brokenRedis = {
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
    const loader = new PrincipalContextLoader(
      {
        user: {
          findUnique: async () => row(),
        },
      } as never,
      brokenRedis as never,
    );
    const guard = new SessionAuthenticationGuard(
      { verify: async () => ({ subjectId: 'user-1' }) } as never,
      loader,
    );
    void world;

    await expect(request(guard)).resolves.toBe(true);
    await expect(request(guard)).resolves.toBe(true);
  });
});
