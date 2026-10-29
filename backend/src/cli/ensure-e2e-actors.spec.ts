import { hash } from 'bcrypt';
import {
  ensureE2EActors,
  isDisposableActorEmail,
  parseActorsFromEnvironment,
  parseActorsFromJson,
  type E2EActorSpec,
} from './ensure-e2e-actors';
import type { PrismaService } from '../common/prisma/prisma.service';

/*
  The harness' actors are ordinary accounts, so the interesting assertions are
  about what this command refuses to do: no password for an address that is not
  a disposable test account, no local hash next to a directory identity, no
  resurrection of an anonymized account, and no write at all when the configured
  password already works.
*/

const password = 'Zeleni-Kaktus-42x';
const weakPassword = 'kratka';

/*
  Real bcrypt hashes at the cheapest cost, because the assertions about "the
  configured password already works" have to go through `verifyLocalPassword`
  and therefore through `compare`. The shim in `src/types/bcrypt.d.ts` declares
  only what the product uses (`hash`, `compare`), so nothing sync here.
*/
let passwordHash = '';
let stalePasswordHash = '';
beforeAll(async () => {
  passwordHash = await hash(password, 4);
  stalePasswordHash = await hash('Neka-Stara-Sifra-9', 4);
});

type FakeUser = {
  id: string;
  email: string;
  displayName: string;
  isActive: boolean;
  isLocalOnly: boolean;
  mustChangePassword: boolean;
  localPasswordHash: string | null;
  organizationalUnitId: string | null;
  entraObjectId: string | null;
  directoryObjectGuid: string | null;
  anonymizedAt: Date | null;
  authzVersion: number;
};

/** What `user.create` receives: the columns the CLI writes, plus the defaults. */
type FakeUserWrite = Partial<FakeUser> & {
  email: string;
  displayName: string;
  passwordChangedAt?: Date;
};

type FakeState = {
  users: FakeUser[];
  userRoles: Array<{ id: string; userId: string; roleKey: string; organizationalUnitId: string | null }>;
  roles: Array<{ id: string; key: string; name: string }>;
  units: Array<{ id: string; name: string; ouPath: string }>;
  mfa: Array<{ id: string; userId: string }>;
  updates: Array<{ id: string; data: Record<string, unknown> }>;
  auditActions: string[];
  invalidated: string[];
};

function fakeUser(email: string, overrides: Partial<FakeUser> = {}): FakeUser {
  return {
    id: `id-${email}`,
    email,
    displayName: 'Postojeci',
    isActive: true,
    isLocalOnly: true,
    mustChangePassword: false,
    localPasswordHash: null,
    organizationalUnitId: null,
    entraObjectId: null,
    directoryObjectGuid: null,
    anonymizedAt: null,
    authzVersion: 0,
    ...overrides,
  };
}

function createFakePrisma(input: {
  users?: FakeUser[];
  roles?: Array<{ id: string; key: string; name: string }>;
  units?: Array<{ id: string; name: string; ouPath: string }>;
  userRoles?: FakeState['userRoles'];
  mfa?: FakeState['mfa'];
}): { prisma: PrismaService; state: FakeState } {
  const state: FakeState = {
    users: [...(input.users ?? [])],
    userRoles: [...(input.userRoles ?? [])],
    roles: [...(input.roles ?? [])],
    units: [...(input.units ?? [])],
    mfa: [...(input.mfa ?? [])],
    updates: [],
    auditActions: [],
    invalidated: [],
  };
  let sequence = 0;
  const nextId = (prefix: string): string => `${prefix}-${(sequence += 1)}`;
  const roleKeyById = (roleId: string | undefined): string | null =>
    state.roles.find((role) => role.id === roleId)?.key ?? null;

  const auditLog = {
    findFirst: async () => ({ hash: 'genesis' }),
    create: async (args: { data: Record<string, unknown> }) => {
      state.auditActions.push(String(args.data.action));
      return { id: nextId('audit') };
    },
  };
  const userRole = {
    findFirst: async (args: {
      where?: { userId?: string; roleId?: string; role?: { key?: string } };
    }) => {
      const where = args.where ?? {};
      const wantedKey = where.role?.key ?? roleKeyById(where.roleId);
      const match = state.userRoles.find(
        (entry) =>
          entry.userId === where.userId && (wantedKey === null || entry.roleKey === wantedKey),
      );
      if (match === undefined) {
        return null;
      }
      const role = state.roles.find((entry) => entry.key === match.roleKey);
      return {
        ...match,
        roleId: role?.id ?? 'role-id',
        role: { key: match.roleKey, name: role?.name ?? match.roleKey },
        organizationalUnit: null,
        service: null,
      };
    },
    create: async (args: {
      data: { userId: string; roleId: string; organizationalUnitId?: string | null };
    }) => {
      const roleKey = roleKeyById(args.data.roleId) ?? 'UNKNOWN';
      const created = {
        id: nextId('user-role'),
        userId: args.data.userId,
        roleKey,
        organizationalUnitId: args.data.organizationalUnitId ?? null,
      };
      state.userRoles.push(created);
      const role = state.roles.find((entry) => entry.key === roleKey);
      return {
        ...created,
        role: { key: roleKey, name: role?.name ?? roleKey },
        organizationalUnit: null,
        service: null,
      };
    },
  };
  const client = {
    $executeRaw: async () => 0,
    $transaction: async (argument: unknown) =>
      typeof argument === 'function'
        ? (argument as (tx: unknown) => Promise<unknown>)(client)
        : Promise.all(argument as unknown[]),
    auditLog,
    userRole,
    role: {
      findUnique: async (args: { where: { key: string } }) =>
        state.roles.find((role) => role.key === args.where.key) ?? null,
      create: async (args: { data: { key: string; name: string } }) => {
        const created = { id: nextId('role'), key: args.data.key, name: args.data.name };
        state.roles.push(created);
        return created;
      },
    },
    organizationalUnit: {
      findFirst: async () => state.units[0] ?? null,
      findUnique: async (args: { where: { id: string } }) =>
        state.units.find((unit) => unit.id === args.where.id) ?? null,
    },
    userMfa: {
      findFirst: async (args: { where: { userId: string } }) =>
        state.mfa.find((entry) => entry.userId === args.where.userId) ?? null,
      deleteMany: async (args: { where: { userId: string } }) => {
        const before = state.mfa.length;
        state.mfa = state.mfa.filter((entry) => entry.userId !== args.where.userId);
        return { count: before - state.mfa.length };
      },
    },
    userMfaRecoveryCode: {
      deleteMany: async () => ({ count: 0 }),
    },
    user: {
      findUnique: async (args: { where: Record<string, string> }) => {
        const email = args.where.email?.toLowerCase();
        const id = args.where.id;
        return (
          state.users.find(
            (user) =>
              (email !== undefined && user.email === email) || (id !== undefined && user.id === id),
          ) ?? null
        );
      },
      create: async (args: { data: FakeUserWrite }) => {
        const email = args.data.email.trim().toLowerCase();
        const created = fakeUser(email, {
          ...args.data,
          id: nextId('user'),
          email,
          isActive: args.data.isActive ?? true,
          isLocalOnly: args.data.isLocalOnly ?? false,
          mustChangePassword: args.data.mustChangePassword ?? false,
          localPasswordHash: args.data.localPasswordHash ?? null,
          organizationalUnitId: args.data.organizationalUnitId ?? null,
          entraObjectId: args.data.entraObjectId ?? null,
        });
        state.users.push(created);
        return created;
      },
      update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        state.updates.push({ id: args.where.id, data: args.data });
        const target = state.users.find((user) => user.id === args.where.id);
        if (target !== undefined) {
          Object.assign(target, args.data);
        }
        return target ?? null;
      },
    },
  };
  return { prisma: client as unknown as PrismaService, state };
}

const fastHash = async (value: string): Promise<string> => `hashed:${value}`;
const userActor: E2EActorSpec = {
  email: 'e2e.user@example.com',
  password,
  roleKey: 'USER',
  displayName: 'E2E User',
};
const agentActor: E2EActorSpec = { ...userActor, email: 'e2e.agent@example.com', roleKey: 'AGENT' };
const superAdminActor: E2EActorSpec = {
  email: 'e2e.superadmin@example.com',
  password,
  roleKey: 'SUPER_ADMIN',
  displayName: 'E2E SuperAdmin',
};

describe('ensure-e2e-actors: reading the actors', () => {
  it('uses the harness defaults, so the CLI and the harness agree', () => {
    const actors = parseActorsFromEnvironment({
      E2E_SUPERADMIN_PASSWORD: 'a',
      E2E_USER_PASSWORD: 'b',
      E2E_AGENT_PASSWORD: 'c',
    });
    expect(actors.map((actor) => [actor.email, actor.roleKey])).toEqual([
      ['e2e.superadmin@example.com', 'SUPER_ADMIN'],
      ['e2e.user@example.com', 'USER'],
      ['e2e.agent@example.com', 'AGENT'],
    ]);
    expect(actors.map((actor) => actor.displayName)).toEqual([
      'E2E SuperAdmin',
      'E2E User',
      'E2E Agent',
    ]);
  });

  it('skips an actor whose password is not configured instead of half-creating it', () => {
    const actors = parseActorsFromEnvironment({
      E2E_SUPERADMIN_EMAIL: ' E2E.Root@Example.COM ',
      E2E_SUPERADMIN_PASSWORD: 'a',
      E2E_USER_PASSWORD: '',
    });
    expect(actors).toEqual([
      expect.objectContaining({ email: 'e2e.root@example.com', roleKey: 'SUPER_ADMIN' }),
    ]);
  });

  it('reads a JSON document and insists on a role it can assign', () => {
    expect(
      parseActorsFromJson(JSON.stringify({ actors: [{ email: 'e2e.a@example.com', password, roleKey: 'agent' }] })),
    ).toEqual([
      { email: 'e2e.a@example.com', password, roleKey: 'AGENT', displayName: 'E2E Agent' },
    ]);
    expect(
      parseActorsFromJson(JSON.stringify([{ email: 'e2e.b@example.com', password, roleKey: 'USER', displayName: 'B' }])),
    ).toEqual([{ email: 'e2e.b@example.com', password, roleKey: 'USER', displayName: 'B' }]);
    expect(() =>
      parseActorsFromJson(JSON.stringify([{ email: 'e2e.c@example.com', password, roleKey: 'ADMIN' }])),
    ).toThrow(/roleKey must be one of SUPER_ADMIN, USER, AGENT/);
    expect(() => parseActorsFromJson(JSON.stringify([{ email: 'e2e.d@example.com', roleKey: 'USER' }]))).toThrow(
      /email and password are required/,
    );
    expect(() => parseActorsFromJson('{"actors":{}}')).toThrow(/expected/);
  });

  it('accepts only disposable addresses', () => {
    expect(isDisposableActorEmail('e2e.user@example.com')).toBe(true);
    expect(isDisposableActorEmail('admin@firma.ba')).toBe(false);
    expect(isDisposableActorEmail('admin@firma.ba', 'admin@firma.ba')).toBe(true);
  });
});

describe('ensure-e2e-actors: creating', () => {
  it('creates a missing actor as an ordinary local account in the first unit', async () => {
    const { prisma, state } = createFakePrisma({
      units: [
        { id: 'ou-root', name: 'Root', ouPath: '/root' },
        { id: 'ou-child', name: 'Child', ouPath: '/root/child' },
      ],
      roles: [{ id: 'role-user', key: 'USER', name: 'User' }],
    });

    const [outcome] = await ensureE2EActors(prisma, [userActor], { hashPassword: fastHash });

    expect(outcome).toMatchObject({
      action: 'created',
      roleKey: 'USER',
      organizationalUnitId: 'ou-root',
    });
    const created = state.users.find((user) => user.email === userActor.email);
    expect(created).toMatchObject({
      // Unattended sign-in: no forced change, and the password is a hash.
      mustChangePassword: false,
      isActive: true,
      isLocalOnly: true,
      localPasswordHash: `hashed:${password}`,
      organizationalUnitId: 'ou-root',
    });
    expect(state.userRoles).toEqual([
      expect.objectContaining({ userId: created?.id, roleKey: 'USER', organizationalUnitId: 'ou-root' }),
    ]);
    expect(state.auditActions).toContain('user.created');
  });

  it('creates the system role when the installation does not have it yet', async () => {
    const { prisma, state } = createFakePrisma({ units: [{ id: 'ou-root', name: 'Root', ouPath: '/root' }] });

    await ensureE2EActors(prisma, [agentActor], { hashPassword: fastHash });

    expect(state.roles).toEqual([expect.objectContaining({ key: 'AGENT', name: 'Agent', })]);
    expect(state.userRoles).toEqual([expect.objectContaining({ roleKey: 'AGENT' })]);
  });

  it('applies the local-only SuperAdmin invariant', async () => {
    const { prisma, state } = createFakePrisma({ units: [] });

    const [outcome] = await ensureE2EActors(prisma, [superAdminActor], { hashPassword: fastHash });

    expect(outcome?.action).toBe('created');
    // A SuperAdmin needs no home unit, so the empty tree is not worth a warning.
    expect(outcome?.notes).not.toEqual(expect.arrayContaining([expect.stringContaining('no_organizational_unit')]));
    expect(state.users[0]).toMatchObject({ isLocalOnly: true, entraObjectId: null });
    expect(state.userRoles).toEqual([expect.objectContaining({ roleKey: 'SUPER_ADMIN' })]);
  });

  it('says out loud when a USER has no home unit to open tickets in', async () => {
    const { prisma } = createFakePrisma({ units: [] });

    const [outcome] = await ensureE2EActors(prisma, [userActor], { hashPassword: fastHash });

    expect(outcome?.action).toBe('created');
    expect(outcome?.organizationalUnitId).toBeNull();
    expect(outcome?.notes.join(' ')).toMatch(/no_organizational_unit/);
  });
});

describe('ensure-e2e-actors: aligning', () => {
  it('leaves an actor alone when the configured password already works', async () => {
    const { prisma, state } = createFakePrisma({
      units: [{ id: 'ou-root', name: 'Root', ouPath: '/root' }],
      roles: [{ id: 'role-user', key: 'USER', name: 'User' }],
      users: [
        fakeUser(userActor.email, {
          localPasswordHash: passwordHash,
          organizationalUnitId: 'ou-root',
        }),
      ],
      userRoles: [{ id: 'ur-1', userId: `id-${userActor.email}`, roleKey: 'USER', organizationalUnitId: 'ou-root' }],
    });

    const [outcome] = await ensureE2EActors(prisma, [userActor], { hashPassword: fastHash });

    expect(outcome?.action).toBe('unchanged');
    expect(state.updates).toEqual([]);
    expect(state.invalidated).toEqual([]);
  });

  it('aligns password, unit, forced change and a missing role, and drops the authz cache', async () => {
    const existingId = 'id-e2e.agent@example.com';
    const { prisma, state } = createFakePrisma({
      units: [{ id: 'ou-root', name: 'Root', ouPath: '/root' }],
      roles: [{ id: 'role-agent', key: 'AGENT', name: 'Agent' }],
      users: [
        fakeUser(agentActor.email, {
          localPasswordHash: stalePasswordHash,
          mustChangePassword: true,
          isActive: false,
          organizationalUnitId: 'ou-old',
        }),
      ],
    });
    const invalidatePrincipal = async (userId: string): Promise<null> => {
      state.invalidated.push(userId);
      return null;
    };

    const [outcome] = await ensureE2EActors(prisma, [agentActor], { hashPassword: fastHash, invalidatePrincipal });

    expect(outcome?.action).toBe('aligned');
    expect(outcome?.notes.join(' ')).toMatch(
      /reactivated.*organizational_unit.*password.*must_change_password_cleared.*role_assigned=AGENT/,
    );
    expect(state.updates).toEqual([
      {
        id: existingId,
        data: expect.objectContaining({
          isActive: true,
          organizationalUnitId: 'ou-root',
          localPasswordHash: `hashed:${password}`,
          mustChangePassword: false,
        }),
      },
    ]);
    expect(state.userRoles).toEqual([expect.objectContaining({ userId: existingId, roleKey: 'AGENT' })]);
    expect(state.invalidated).toContain(existingId);
  });

  it('restores the SuperAdmin local-only invariant on an existing account', async () => {
    const { prisma, state } = createFakePrisma({
      units: [],
      roles: [{ id: 'role-sa', key: 'SUPER_ADMIN', name: 'SuperAdmin' }],
      users: [
        fakeUser(superAdminActor.email, {
          isLocalOnly: false,
          localPasswordHash: passwordHash,
        }),
      ],
      userRoles: [
        {
          id: 'ur-sa',
          userId: `id-${superAdminActor.email}`,
          roleKey: 'SUPER_ADMIN',
          organizationalUnitId: null,
        },
      ],
    });

    const [outcome] = await ensureE2EActors(prisma, [superAdminActor], { hashPassword: fastHash });

    expect(outcome?.action).toBe('aligned');
    expect(outcome?.notes).toContain('local_only_invariant');
    expect(state.updates[0]?.data).toMatchObject({ isLocalOnly: true, entraObjectId: null });
  });
});

describe('ensure-e2e-actors: refusing', () => {
  it('never writes a password for an address that is not a test account', async () => {
    const { prisma, state } = createFakePrisma({ units: [] });

    const [outcome] = await ensureE2EActors(
      prisma,
      [{ ...userActor, email: 'admin@firma.ba' }],
      { hashPassword: fastHash },
    );

    expect(outcome?.action).toBe('refused');
    expect(outcome?.notes.join(' ')).toMatch(/not a disposable test account/);
    expect(state.users).toEqual([]);
    expect(state.updates).toEqual([]);
  });

  it('refuses a password the offline policy rejects, unless the operator insists', async () => {
    const { prisma, state } = createFakePrisma({ units: [] });

    const [refused] = await ensureE2EActors(prisma, [{ ...userActor, password: weakPassword }], {
      hashPassword: fastHash,
    });
    expect(refused?.action).toBe('refused');
    expect(refused?.notes.join(' ')).toMatch(/TOO_SHORT/);
    expect(state.users).toEqual([]);

    const [forced] = await ensureE2EActors(prisma, [{ ...userActor, password: weakPassword }], {
      hashPassword: fastHash,
      allowPolicyViolation: true,
    });
    expect(forced?.action).toBe('created');
    expect(state.users[0]?.localPasswordHash).toBe(`hashed:${weakPassword}`);
  });

  it('leaves a directory-managed account to its directory', async () => {
    const { prisma, state } = createFakePrisma({
      units: [],
      users: [fakeUser(userActor.email, { directoryObjectGuid: 'guid-1', localPasswordHash: null })],
    });

    const [outcome] = await ensureE2EActors(prisma, [userActor], { hashPassword: fastHash });

    expect(outcome?.action).toBe('refused');
    expect(outcome?.notes.join(' ')).toMatch(/directory-managed/);
    expect(state.updates).toEqual([]);
  });

  it('does not resurrect an anonymized account', async () => {
    const { prisma, state } = createFakePrisma({
      units: [],
      users: [fakeUser(userActor.email, { anonymizedAt: new Date('2026-01-01') })],
    });

    const [outcome] = await ensureE2EActors(prisma, [userActor], { hashPassword: fastHash });

    expect(outcome?.action).toBe('refused');
    expect(outcome?.notes.join(' ')).toMatch(/anonymized/);
    expect(state.updates).toEqual([]);
  });
});

describe('ensure-e2e-actors: second factor', () => {
  const enrolled = { units: [], users: [fakeUser(userActor.email, { localPasswordHash: passwordHash })] };

  it('reports an enrolled factor instead of removing it', async () => {
    const { prisma, state } = createFakePrisma({
      ...enrolled,
      roles: [{ id: 'role-user', key: 'USER', name: 'User' }],
      userRoles: [{ id: 'ur-1', userId: `id-${userActor.email}`, roleKey: 'USER', organizationalUnitId: null }],
      mfa: [{ id: 'mfa-1', userId: `id-${userActor.email}` }],
    });

    const [outcome] = await ensureE2EActors(prisma, [userActor], { hashPassword: fastHash });

    expect(outcome?.notes.join(' ')).toMatch(/mfa_enrolled/);
    expect(state.mfa).toHaveLength(1);
  });

  it('removes the factor only when --reset-mfa asked for it', async () => {
    const { prisma, state } = createFakePrisma({
      ...enrolled,
      roles: [{ id: 'role-user', key: 'USER', name: 'User' }],
      userRoles: [{ id: 'ur-1', userId: `id-${userActor.email}`, roleKey: 'USER', organizationalUnitId: null }],
      mfa: [{ id: 'mfa-1', userId: `id-${userActor.email}` }],
    });

    const [outcome] = await ensureE2EActors(prisma, [userActor], { hashPassword: fastHash, resetMfa: true });

    expect(outcome?.notes).toContain('mfa_reset');
    expect(state.mfa).toEqual([]);
  });
});
