import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import type { PrismaService } from '../common/prisma/prisma.service';
import { createRedisClient } from '../common/redis/create-redis-client';
import { loadRedisConfiguration } from '../common/redis/load-redis-configuration';
import { PrincipalContextInvalidator } from '../common/principal-context/principal-context-invalidator.service';
import {
  auditLogActions,
  auditLogEntityTypes,
} from '../modules/audit-log/audit-log.constants';
import { recordAuditEntry } from '../modules/audit-log/record-audit-entry';
import { authorizationRoleKeys } from '../modules/authorization/authorization.constants';
import { applySuperAdminLocalOnlyInvariant } from '../modules/authentication/apply-super-admin-local-only-invariant';
import { assertSuperAdminIsLocalOnly } from '../modules/authentication/assert-super-admin-is-local-only';
import { hashLocalPassword } from '../modules/authentication/hash-local-password';
import { verifyLocalPassword } from '../modules/authentication/verify-local-password';
import { checkPassword } from '../modules/authentication/security/password-policy';
import { installSuperAdminDefaultPasswordPolicy } from '../modules/install/install-super-admin-password-policy';
import { assignUserRole } from '../modules/users/assign-user-role';
import { ensureSystemRole } from '../modules/users/ensure-system-role';

/*
  The E2E harness signs in as three accounts it does not create: the super admin
  comes from the install wizard, and USER/AGENT come from `provisionTestActors`,
  which needs a super-admin session first. On a stack whose wizard was completed
  by hand the founder account is not `E2E_SUPERADMIN_EMAIL`, so the harness has
  nobody to sign in as and every run dies in `global-setup` — which reads like a
  product failure and is not one.

  This command closes that gap from the server side: it creates the actors from
  the environment (or from a JSON document on stdin) when they are missing and
  aligns them when they exist, through the same primitives the API uses
  (`ensureSystemRole`, `assignUserRole`, the local-only SuperAdmin invariant, the
  authorization-cache invalidation), so what it leaves behind are ordinary
  accounts and not a shortcut around the schema.

  It runs inside the backend container, where shell access is the trust boundary
  (the same rule as `cli/reset-mfa.js`):

    docker exec -i <backend> node dist/src/cli/ensure-e2e-actors.js
    docker exec -i <backend> node dist/src/cli/ensure-e2e-actors.js --stdin < actors.json

  Passwords come from the environment or from stdin, never from argv: a command
  line is readable in `ps`, lands in shell history and is recorded by the exec
  session.

  Refused on purpose:
  * an address that is not a disposable test account (`e2e.*`, or listed in
    `E2E_ALLOW_REAL_ACCOUNTS`) — the same rule as
    `e2e/helpers/disposable-account.ts`, because this command overwrites
    passwords and would otherwise lock a real person out;
  * a directory-managed account (`entraObjectId` / `directoryObjectGuid` set) —
    its password belongs to Entra/AD, and a local hash next to it is a backdoor;
  * an anonymized account (`anonymizedAt` set) — Paket 2.6 makes that final;
  * a password the offline policy refuses, unless `--allow-policy-violation`
    says the operator means it. The deployment's own policy is stricter still
    (organisation words from settings plus the Pwned Passwords check), so a
    password accepted here can still be refused by `POST /auth/change-password`;
    the harness then generates one for the run.
*/

/** The three actors the harness signs in as, with the harness' own defaults. */
const actorEnvironment = [
  {
    roleKey: authorizationRoleKeys.superAdmin,
    emailKey: 'E2E_SUPERADMIN_EMAIL',
    passwordKey: 'E2E_SUPERADMIN_PASSWORD',
    defaultEmail: 'e2e.superadmin@example.com',
    defaultDisplayName: 'E2E SuperAdmin',
  },
  {
    roleKey: authorizationRoleKeys.user,
    emailKey: 'E2E_USER_EMAIL',
    passwordKey: 'E2E_USER_PASSWORD',
    defaultEmail: 'e2e.user@example.com',
    defaultDisplayName: 'E2E User',
  },
  {
    roleKey: authorizationRoleKeys.agent,
    emailKey: 'E2E_AGENT_EMAIL',
    passwordKey: 'E2E_AGENT_PASSWORD',
    defaultEmail: 'e2e.agent@example.com',
    defaultDisplayName: 'E2E Agent',
  },
] as const;

const cliRequestId = 'cli:ensure-e2e-actors';

export type E2EActorRoleKey =
  | (typeof authorizationRoleKeys)['superAdmin']
  | (typeof authorizationRoleKeys)['user']
  | (typeof authorizationRoleKeys)['agent'];

export type E2EActorSpec = {
  readonly email: string;
  readonly password: string;
  readonly roleKey: E2EActorRoleKey;
  readonly displayName: string;
};

export type E2EActorOutcome = {
  readonly email: string;
  readonly roleKey: string;
  readonly action: 'created' | 'aligned' | 'unchanged' | 'refused';
  readonly userId: string | null;
  readonly organizationalUnitId: string | null;
  readonly notes: readonly string[];
};

export type EnsureE2EActorsOptions = {
  /** Writes the password even when the offline policy refuses it. */
  readonly allowPolicyViolation?: boolean;
  /** Deletes MFA for the actors — a second factor removed, so opt-in only. */
  readonly resetMfa?: boolean;
  /** Pins the home unit; defaults to the first node of the unit tree. */
  readonly organizationalUnitId?: string | null;
  /** Test seam: bcrypt cost 12 is too slow to pay per assertion. */
  readonly hashPassword?: (password: string) => Promise<string>;
  /** Test seam for the authorization-cache invalidation. */
  readonly invalidatePrincipal?: (userId: string) => Promise<unknown>;
};

const allowedRoleKeys: readonly string[] = [
  authorizationRoleKeys.superAdmin,
  authorizationRoleKeys.user,
  authorizationRoleKeys.agent,
];

/**
 * Mirrors `isDisposableTestAccount` in `e2e/helpers/disposable-account.ts`.
 * Duplicated rather than imported on purpose: `e2e/` is a separate package the
 * backend build must not depend on, and a safety guard that is missing is worse
 * than one that exists twice.
 */
export function isDisposableActorEmail(
  email: string,
  allowList: string | undefined = process.env.E2E_ALLOW_REAL_ACCOUNTS,
): boolean {
  const normalized = email.trim().toLowerCase();
  if (normalized.split('@')[0]?.startsWith('e2e.')) {
    return true;
  }
  return (allowList ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0)
    .includes(normalized);
}

/** Actors from `E2E_*_EMAIL` / `E2E_*_PASSWORD`, with the harness' defaults. */
export function parseActorsFromEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): readonly E2EActorSpec[] {
  const actors: E2EActorSpec[] = [];
  for (const entry of actorEnvironment) {
    const email = (env[entry.emailKey] ?? entry.defaultEmail).trim();
    const password = env[entry.passwordKey] ?? '';
    // No password means nothing to align: the harness would not accept these
    // credentials either, so the actor is left alone instead of half-created.
    if (email.length === 0 || password.length === 0) {
      continue;
    }
    actors.push({
      email: email.toLowerCase(),
      password,
      roleKey: entry.roleKey,
      displayName: entry.defaultDisplayName,
    });
  }
  return actors;
}

/**
 * Actors from a JSON document: `{ "actors": [{ email, password, roleKey?,
 * displayName? }] }` (a bare array works too). `roleKey` must be given.
 */
export function parseActorsFromJson(text: string): readonly E2EActorSpec[] {
  const parsed: unknown = JSON.parse(text);
  const list = Array.isArray(parsed)
    ? parsed
    : ((parsed as { actors?: unknown } | null)?.actors ?? []);
  if (!Array.isArray(list)) {
    throw new Error('expected { "actors": [ … ] } or a JSON array of actors');
  }
  return list.map((entry, index) => {
    const actor = entry as {
      email?: unknown;
      password?: unknown;
      roleKey?: unknown;
      displayName?: unknown;
    };
    const email = typeof actor.email === 'string' ? actor.email.trim().toLowerCase() : '';
    const password = typeof actor.password === 'string' ? actor.password : '';
    const roleKey = typeof actor.roleKey === 'string' ? actor.roleKey.trim().toUpperCase() : '';
    if (email.length === 0 || password.length === 0) {
      throw new Error(`actor #${index + 1}: email and password are required`);
    }
    if (!allowedRoleKeys.includes(roleKey)) {
      throw new Error(
        `actor #${index + 1} (${email}): roleKey must be one of ${allowedRoleKeys.join(', ')}`,
      );
    }
    return {
      email,
      password,
      roleKey: roleKey as E2EActorRoleKey,
      displayName:
        typeof actor.displayName === 'string' && actor.displayName.trim().length > 0
          ? actor.displayName.trim()
          : `E2E ${roleKey.charAt(0)}${roleKey.slice(1).toLowerCase()}`,
    };
  });
}

/**
 * Creates or aligns every actor. A single refused actor never throws: the caller
 * gets one outcome per actor and decides what a refusal means.
 */
export async function ensureE2EActors(
  prisma: PrismaService,
  actors: readonly E2EActorSpec[],
  options: EnsureE2EActorsOptions = {},
): Promise<readonly E2EActorOutcome[]> {
  const context: ActorContext = {
    organizationalUnitId:
      options.organizationalUnitId !== undefined
        ? options.organizationalUnitId
        : await firstOrganizationalUnitId(prisma),
    hashPassword: options.hashPassword ?? hashLocalPassword,
    invalidatePrincipal: options.invalidatePrincipal ?? (async () => null),
    allowPolicyViolation: options.allowPolicyViolation === true,
    resetMfa: options.resetMfa === true,
  };
  const outcomes: E2EActorOutcome[] = [];
  for (const actor of actors) {
    outcomes.push(await ensureActor(prisma, actor, context));
  }
  return outcomes;
}

type ActorContext = {
  readonly organizationalUnitId: string | null;
  readonly hashPassword: (password: string) => Promise<string>;
  readonly invalidatePrincipal: (userId: string) => Promise<unknown>;
  readonly allowPolicyViolation: boolean;
  readonly resetMfa: boolean;
};

/** What an actor looks like before this command touches it. */
type ExistingActor = {
  id: string;
  isActive: boolean;
  isLocalOnly: boolean;
  mustChangePassword: boolean;
  localPasswordHash: string | null;
  organizationalUnitId: string | null;
  entraObjectId: string | null;
  directoryObjectGuid: string | null;
  anonymizedAt: Date | null;
};

async function ensureActor(
  prisma: PrismaService,
  actor: E2EActorSpec,
  context: ActorContext,
): Promise<E2EActorOutcome> {
  const refused = (notes: readonly string[]): E2EActorOutcome => ({
    email: actor.email,
    roleKey: actor.roleKey,
    action: 'refused',
    userId: null,
    organizationalUnitId: context.organizationalUnitId,
    notes,
  });

  if (!isDisposableActorEmail(actor.email)) {
    return refused([
      'not a disposable test account: use an e2e.* address or add it to ' +
        'E2E_ALLOW_REAL_ACCOUNTS (this command overwrites passwords)',
    ]);
  }
  const violations = checkPassword(
    actor.password,
    actor.email,
    installSuperAdminDefaultPasswordPolicy,
  );
  if (violations.length > 0 && !context.allowPolicyViolation) {
    return refused([
      `password refused by the offline policy (${violations.join(', ')}): rotate the ` +
        'secret, or pass --allow-policy-violation to write it anyway',
    ]);
  }

  const existing: ExistingActor | null = await prisma.user.findUnique({
    where: { email: actor.email },
    select: {
      id: true,
      isActive: true,
      isLocalOnly: true,
      mustChangePassword: true,
      localPasswordHash: true,
      organizationalUnitId: true,
      entraObjectId: true,
      directoryObjectGuid: true,
      anonymizedAt: true,
    },
  });

  if (existing === null) {
    return createActor(prisma, actor, context);
  }
  if (existing.anonymizedAt !== null) {
    return refused(['account is anonymized (Paket 2.6 is final): use another address']);
  }
  if (existing.entraObjectId !== null || existing.directoryObjectGuid !== null) {
    return refused([
      'account is directory-managed: its password belongs to Entra/AD, so no local ' +
        'hash is written for it',
    ]);
  }
  return alignActor(prisma, actor, existing, context);
}

async function createActor(
  prisma: PrismaService,
  actor: E2EActorSpec,
  context: ActorContext,
): Promise<E2EActorOutcome> {
  const notes: string[] = [];
  // A stack installed before a role was ever assigned may not have the row;
  // `assignUserRole` below insists on it. A role this command had to create has
  // no permissions yet, which is worth saying out loud: the actor would sign in
  // and be able to do nothing.
  const roleExists =
    (await prisma.role.findUnique({
      where: { key: actor.roleKey },
      select: { id: true },
    })) !== null;
  await ensureSystemRole(prisma, actor.roleKey);
  if (!roleExists) {
    notes.push(
      `role_created=${actor.roleKey}: empty until ` +
        'node dist/src/cli/seed-default-role-permissions.js runs',
    );
  }
  const isSuperAdmin = actor.roleKey === authorizationRoleKeys.superAdmin;
  const localOnly = isSuperAdmin
    ? applySuperAdminLocalOnlyInvariant()
    : { isLocalOnly: true as const, entraObjectId: null };
  const organizationalUnitId = await resolveUnitForActor(prisma, actor, context, notes);
  const localPasswordHash = await context.hashPassword(actor.password);

  const created: { id: string; isLocalOnly: boolean; entraObjectId: string | null } =
    await prisma.user.create({
      data: {
        email: actor.email,
        displayName: actor.displayName,
        organizationalUnitId,
        // The harness signs in unattended: no forced change, no second factor.
        mustChangePassword: false,
        isActive: true,
        isLocalOnly: localOnly.isLocalOnly,
        entraObjectId: localOnly.entraObjectId,
        localPasswordHash,
        passwordChangedAt: new Date(),
      },
      select: { id: true, isLocalOnly: true, entraObjectId: true },
    });

  if (isSuperAdmin) {
    assertSuperAdminIsLocalOnly({
      isLocalOnly: created.isLocalOnly,
      entraObjectId: created.entraObjectId,
      roleKeys: [authorizationRoleKeys.superAdmin],
    });
  }
  // The assignment path the admin API uses: it validates the identity, takes the
  // SuperAdmin advisory lock and writes its own audit entry.
  await assignUserRole(
    prisma,
    {
      userId: created.id,
      roleKey: actor.roleKey,
      organizationalUnitId,
      serviceId: null,
      actorUserId: null,
      actorIsSuperAdmin: true,
      requestId: cliRequestId,
    },
    context.invalidatePrincipal,
  );
  await recordAuditEntry(prisma, {
    action: auditLogActions.userCreated,
    entityType: auditLogEntityTypes.user,
    entityId: created.id,
    actorUserId: null,
    requestId: cliRequestId,
    organizationalUnitId,
    metadata: { via: cliRequestId, roleKey: actor.roleKey },
  });
  notes.push(`role=${actor.roleKey}`);
  await applyMfaPolicy(prisma, created.id, actor, context, notes);

  return {
    email: actor.email,
    roleKey: actor.roleKey,
    action: 'created',
    userId: created.id,
    organizationalUnitId,
    notes,
  };
}

/** Only the columns this command may align; everything else stays untouched. */
type ActorAlignment = {
  isActive?: boolean;
  isLocalOnly?: boolean;
  entraObjectId?: null;
  organizationalUnitId?: string;
  mustChangePassword?: boolean;
  localPasswordHash?: string;
  passwordChangedAt?: Date;
};

async function alignActor(
  prisma: PrismaService,
  actor: E2EActorSpec,
  existing: ExistingActor,
  context: ActorContext,
): Promise<E2EActorOutcome> {
  const notes: string[] = [];
  const changes: ActorAlignment = {};
  let changed = false;
  let authorizationChanged = false;

  if (!existing.isActive) {
    changes.isActive = true;
    authorizationChanged = true;
    changed = true;
    notes.push('reactivated');
  }

  const organizationalUnitId = await resolveUnitForActor(prisma, actor, context, notes);
  if (organizationalUnitId !== null && existing.organizationalUnitId !== organizationalUnitId) {
    // Tests scope their data to the first unit of the tree; a stale home unit
    // makes every USER ticket creation fail with FORBIDDEN, which is why
    // `provisionTestActors` PATCHes the unit on every run.
    changes.organizationalUnitId = organizationalUnitId;
    authorizationChanged = true;
    changed = true;
    notes.push('organizational_unit');
  }

  const passwordMatches =
    existing.localPasswordHash !== null &&
    (await verifyLocalPassword(actor.password, existing.localPasswordHash));
  if (!passwordMatches) {
    changes.localPasswordHash = await context.hashPassword(actor.password);
    changes.passwordChangedAt = new Date();
    changed = true;
    notes.push('password');
  }
  if (existing.mustChangePassword) {
    changes.mustChangePassword = false;
    changed = true;
    notes.push('must_change_password_cleared');
  }
  if (actor.roleKey === authorizationRoleKeys.superAdmin && !existing.isLocalOnly) {
    // The invariant is not negotiable for a SuperAdmin: local-only, no external
    // identity (a directory-managed account was refused above).
    changes.isLocalOnly = true;
    changes.entraObjectId = null;
    authorizationChanged = true;
    changed = true;
    notes.push('local_only_invariant');
  }

  const role: { id: string } | null = await prisma.userRole.findFirst({
    where: { userId: existing.id, role: { key: actor.roleKey } },
    select: { id: true },
  });
  if (role === null) {
    await ensureSystemRole(prisma, actor.roleKey);
    await assignUserRole(
      prisma,
      {
        userId: existing.id,
        roleKey: actor.roleKey,
        organizationalUnitId: organizationalUnitId ?? existing.organizationalUnitId,
        serviceId: null,
        actorUserId: null,
        actorIsSuperAdmin: true,
        requestId: cliRequestId,
      },
      context.invalidatePrincipal,
    );
    authorizationChanged = true;
    changed = true;
    notes.push(`role_assigned=${actor.roleKey}`);
  }

  if (changed) {
    await prisma.user.update({ where: { id: existing.id }, data: changes });
  }
  if (authorizationChanged) {
    await context.invalidatePrincipal(existing.id);
  }
  await applyMfaPolicy(prisma, existing.id, actor, context, notes);

  return {
    email: actor.email,
    roleKey: actor.roleKey,
    action: changed ? 'aligned' : 'unchanged',
    userId: existing.id,
    organizationalUnitId:
      changes.organizationalUnitId ?? existing.organizationalUnitId ?? organizationalUnitId,
    notes,
  };
}

/**
 * The harness signs in unattended, so an enrolled second factor is a dead end.
 * Removing one is a security-relevant mutation and stays opt-in (`--reset-mfa`);
 * without it the actor is reported instead of modified.
 */
async function applyMfaPolicy(
  prisma: PrismaService,
  userId: string,
  actor: E2EActorSpec,
  context: ActorContext,
  notes: string[],
): Promise<void> {
  const enrolled: { id: string } | null = await prisma.userMfa.findFirst({
    where: { userId },
    select: { id: true },
  });
  if (enrolled === null) {
    return;
  }
  if (!context.resetMfa) {
    notes.push(
      'mfa_enrolled: sign-in will ask for a second factor — ' +
        `node dist/src/cli/reset-mfa.js --email ${actor.email} --reason "e2e"`,
    );
    return;
  }
  await prisma.$transaction([
    prisma.userMfaRecoveryCode.deleteMany({ where: { userId } }),
    prisma.userMfa.deleteMany({ where: { userId } }),
  ]);
  notes.push('mfa_reset');
}

/**
 * The unit the harness scopes its data to: the first node of the tree, which
 * `GET /organizational-units/tree` orders by `ouPath` and then `name`.
 */
async function firstOrganizationalUnitId(prisma: PrismaService): Promise<string | null> {
  const unit: { id: string } | null = await prisma.organizationalUnit.findFirst({
    orderBy: [{ ouPath: 'asc' }, { name: 'asc' }],
    select: { id: true },
  });
  return unit?.id ?? null;
}

async function resolveUnitForActor(
  prisma: PrismaService,
  actor: E2EActorSpec,
  context: ActorContext,
  notes: string[],
): Promise<string | null> {
  const requested = context.organizationalUnitId;
  if (requested === null) {
    // A SuperAdmin needs no home unit; USER and AGENT do (a user may only open
    // tickets in its own unit), so say it out loud instead of failing silently.
    if (actor.roleKey !== authorizationRoleKeys.superAdmin) {
      notes.push(
        'no_organizational_unit: the tree is empty, so ticket creation as this actor ' +
          'will be refused — complete the install "team" step first',
      );
    }
    return null;
  }
  const unit: { id: string } | null = await prisma.organizationalUnit.findUnique({
    where: { id: requested },
    select: { id: true },
  });
  if (unit === null) {
    notes.push(`organizational_unit_missing=${requested}`);
    return null;
  }
  return unit.id;
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

function formatOutcome(outcome: E2EActorOutcome): string {
  const notes = outcome.notes.length > 0 ? ` notes=${outcome.notes.join(';')}` : '';
  return (
    `e2e_actor email=${outcome.email} role=${outcome.roleKey} action=${outcome.action} ` +
    `id=${outcome.userId ?? '-'} unit=${outcome.organizationalUnitId ?? '-'}${notes}`
  );
}

async function main(): Promise<number> {
  const asJson = process.argv.includes('--json');
  const fromStdin = process.argv.includes('--stdin');
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is required');
    return 2;
  }

  let actors: readonly E2EActorSpec[];
  try {
    actors = fromStdin
      ? parseActorsFromJson(await readStdin())
      : parseActorsFromEnvironment();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  }
  if (actors.length === 0) {
    console.error(
      'No actor to ensure: set E2E_SUPERADMIN_EMAIL/E2E_SUPERADMIN_PASSWORD, ' +
        'E2E_USER_EMAIL/E2E_USER_PASSWORD and E2E_AGENT_EMAIL/E2E_AGENT_PASSWORD, ' +
        'or pipe { "actors": [ … ] } and pass --stdin.',
    );
    return 2;
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  // Created up front but `lazyConnect`: no command, no connection. Assigning it
  // in this scope (and not inside the hook below) is what keeps the type of
  // `redis` honest at the `finally` that disconnects it.
  let redis: ReturnType<typeof createRedisClient> | null = null;
  try {
    redis = createRedisClient(loadRedisConfiguration(process.env));
  } catch (error) {
    console.warn(
      `Redis configuration unreadable (${String(error)}); the authorization ` +
        'cache is not invalidated, cached decisions expire on their own',
    );
  }
  /**
   * Best effort and bounded. The `authzVersion` bump in the database is what
   * makes a cached decision unreachable and it happens before any Redis call, so
   * a Redis that is down costs nothing but the wait — capped here because ioredis
   * queues offline commands forever and this command must always exit.
   */
  const invalidatePrincipal = async (userId: string): Promise<unknown> => {
    if (redis === null) {
      return null;
    }
    try {
      const invalidator = new PrincipalContextInvalidator(
        prisma as unknown as PrismaService,
        redis,
      );
      return await Promise.race([
        invalidator.invalidateUser(userId),
        new Promise((resolve) => {
          setTimeout(resolve, 5_000).unref();
        }),
      ]);
    } catch (error) {
      console.warn(
        `authorization cache not invalidated for ${userId} (${String(error)}); ` +
          'cached decisions expire on their own',
      );
      return null;
    }
  };

  try {
    const outcomes = await ensureE2EActors(prisma as unknown as PrismaService, actors, {
      allowPolicyViolation: process.argv.includes('--allow-policy-violation'),
      resetMfa: process.argv.includes('--reset-mfa'),
      invalidatePrincipal,
    });

    if (asJson) {
      console.log(JSON.stringify({ actors: outcomes }, null, 2));
    } else {
      for (const outcome of outcomes) {
        console.log(formatOutcome(outcome));
      }
      const count = (action: E2EActorOutcome['action']): number =>
        outcomes.filter((outcome) => outcome.action === action).length;
      console.log(
        `e2e_actor_summary created=${count('created')} aligned=${count('aligned')} ` +
          `unchanged=${count('unchanged')} refused=${count('refused')}`,
      );
    }
    return outcomes.some((outcome) => outcome.action === 'refused') ? 3 : 0;
  } finally {
    await prisma.$disconnect();
    redis?.disconnect();
  }
}

// Guarded so a unit test can import the helpers without the CLI running (and
// calling `process.exit`) — the same rule as the other commands in `src/cli/`.
if (require.main === module) {
  main().then(
    (code) => process.exit(code),
    (error: unknown) => {
      console.error(error);
      process.exit(1);
    },
  );
}
