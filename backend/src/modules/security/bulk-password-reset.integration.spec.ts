import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { TransactionalOutboxService } from '../../common/outbox/transactional-outbox.service';
import { PrivilegedAuditService } from '../../common/privileged-audit/privileged-audit.service';
import { auditLogActions } from '../audit-log/audit-log.constants';
import { BulkPasswordResetService } from './bulk-password-reset.service';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

/*
  W2.23 (`BA-security-02`): unit specs prove which calls are made; only real
  PostgreSQL proves the *state* under an injected registry outage.

  The acceptance from `docs/backend/audits/09-security.md` is one sentence: an
  outage of the session registry must leave every target immediately unusable
  (the enforcement layer denies the flagged principal before any registry
  cleanup), or leave a durable pending retry that converges — and it must never
  be reported as a finished 200.

  These three cases are that sentence, one per branch:
    1. registry healthy        -> cutoff + revoked rows + flag, `COMPLETE`;
    2. registry down (throws)  -> the same durable state, `PARTIAL` + pendingUsers;
    3. block cannot commit     -> rolled back whole for that target only, `PARTIAL`
                                  + failedUsers, and no accelerator call for it.
*/
describeIfDatabase('bulk password reset (integration)', () => {
  const stamp = `${process.pid}-${Date.now()}`;

  let prisma: PrismaClient;
  /**
   * `UserSession.revokedByUserId` is a foreign key, so the acting admin has to be
   * a real row. An **inactive** local account is a valid actor here (the step-up is
   * stubbed) and is never a target: `listEligibleUsers` requires `isActive: true`.
   */
  let actorUserId = '';
  /**
   * Local accounts the isolated template already contains (expected: none). Read
   * before any fixture exists so the counts below stay honest either way instead
   * of pinning a number that only holds on an empty template.
   */
  let baseline = 0;
  /** Of those, the ones that are still unflagged (what `changedUsers` may count). */
  let baselineUnflagged = 0;

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    const actor = await prisma.user.create({
      data: {
        email: `bulk-reset-actor-${stamp}@example.invalid`,
        displayName: 'Bulk reset actor',
        localPasswordHash: 'x',
        isLocalOnly: true,
        isActive: false,
      },
    });
    actorUserId = actor.id;
    const existing = await prisma.user.findMany({
      where: {
        isActive: true,
        isLocalOnly: true,
        localPasswordHash: { not: null },
        entraObjectId: null,
        directoryObjectGuid: null,
        anonymizedAt: null,
      },
      select: {
        mustChangePassword: true,
        userRoles: { select: { role: { select: { key: true } } } },
      },
    });
    const eligible = existing.filter(
      (user) => !user.userRoles.some((userRole) => userRole.role.key === 'SUPER_ADMIN'),
    );
    baseline = eligible.length;
    baselineUnflagged = eligible.filter((user) => user.mustChangePassword !== true).length;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { entityId: actorUserId } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: actorUserId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  // Each case must read *its own* audit entry: the actor id is shared, so a row
  // from an earlier case would otherwise win `findFirst`.
  beforeEach(async () => {
    await prisma.auditLog.deleteMany({ where: { entityId: actorUserId } });
  });

  /** The step-up is not what this spec is about; it always succeeds here. */
  const stepUp = { assertConfirmed: async () => undefined };

  function service(options: {
    readonly registry?: { revokeAll: (input: { userId: string }) => Promise<number> };
    readonly database?: PrismaClient;
  } = {}) {
    const calls: string[] = [];
    const registry = options.registry ?? {
      revokeAll: async (input: { userId: string }) => {
        calls.push(input.userId);
        return 1;
      },
    };
    const invalidated: string[][] = [];
    const database = (options.database ?? prisma) as never;
    const instance = new BulkPasswordResetService(
      database,
      stepUp as never,
      registry as never,
      {
        invalidateUsers: async (ids: readonly string[]) => {
          invalidated.push([...ids]);
        },
      } as never,
      // W2.24: the real writer over the real database, so the aggregate entry and
      // its outbox intent are asserted as committed state.
      new PrivilegedAuditService(database, new TransactionalOutboxService(database)),
    );
    return { instance, calls, invalidated };
  }

  async function seedAccount(): Promise<{ userId: string; sessionIds: string[] }> {
    const user = await prisma.user.create({
      data: {
        email: `bulk-reset-${stamp}-${Math.random().toString(36).slice(2, 8)}@example.invalid`,
        displayName: 'Bulk reset fixture',
        localPasswordHash: 'x',
        isLocalOnly: true,
        isActive: true,
        tokensInvalidBeforeExceptJti: 'previous-exception',
      },
    });
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    const sessions = await Promise.all([
      prisma.userSession.create({ data: { userId: user.id, provider: 'local', expiresAt } }),
      prisma.userSession.create({ data: { userId: user.id, provider: 'local', expiresAt } }),
    ]);
    await prisma.userMfa.create({
      data: { userId: user.id, secretEncrypted: 'enc', enabledAt: new Date() },
    });
    return { userId: user.id, sessionIds: sessions.map((session) => session.id) };
  }

  async function cleanup(userId: string): Promise<void> {
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  }

  /** The durable block, read back from PostgreSQL. */
  async function rowState(userId: string, sessionIds: readonly string[]) {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const sessions = await prisma.userSession.findMany({ where: { id: { in: [...sessionIds] } } });
    return {
      mustChangePassword: user.mustChangePassword,
      cutoff: user.tokensInvalidBefore,
      exceptJti: user.tokensInvalidBeforeExceptJti,
      sessionRevoked: sessions.every((session) => session.revokedAt !== null),
      sessionReason: sessions[0]?.revokedReason ?? null,
      sessionActor: sessions[0]?.revokedByUserId ?? null,
      mfaRows: await prisma.userMfa.count({ where: { userId } }),
    };
  }

  it('commits the cutoff, the revoked rows and the flag — and keeps MFA enrolled', async () => {
    const first = await seedAccount();
    const second = await seedAccount();
    const { instance, calls, invalidated } = service();

    try {
      const result = await instance.execute(
        { subjectId: actorUserId, sessionId: null },
        {},
      );

      expect(result).toMatchObject({
        eligibleUsers: baseline + 2,
        changedUsers: baselineUnflagged + 2,
        failedUsers: 0,
        pendingUsers: 0,
        status: 'COMPLETE',
      });
      // Two sessions per fixture, plus whatever the template brought.
      expect(result.revokedSessions).toBeGreaterThanOrEqual(4);

      for (const account of [first, second]) {
        const state = await rowState(account.userId, account.sessionIds);
        expect(state.mustChangePassword).toBe(true);
        expect(state.cutoff).not.toBeNull();
        // A previous exception token must not survive a forced reset.
        expect(state.exceptJti).toBeNull();
        expect(state.sessionRevoked).toBe(true);
        expect(state.sessionReason).toBe('admin');
        expect(state.sessionActor).toBe(actorUserId);
        // A forced password change is not an identity change: MFA stays.
        expect(state.mfaRows).toBe(1);
      }

      expect(calls.sort()).toEqual([first.userId, second.userId].sort());
      // One invalidation call for the blocked set; the order of the ids comes from
      // the database and is therefore compared as a set.
      expect(invalidated).toHaveLength(1);
      expect([...invalidated[0]!].sort()).toEqual([first.userId, second.userId].sort());

      const entry = await prisma.auditLog.findFirst({
        where: { action: auditLogActions.authAdminBulkPasswordReset, entityId: actorUserId },
      });
      expect(entry?.metadata).toMatchObject({
        eligibleUsers: baseline + 2,
        changedUsers: baselineUnflagged + 2,
        failedUsers: 0,
        pendingUsers: 0,
        status: 'COMPLETE',
      });
    } finally {
      await cleanup(first.userId);
      await cleanup(second.userId);
    }
  });

  it('leaves every target unusable when the registry is down, and reports PARTIAL', async () => {
    const first = await seedAccount();
    const second = await seedAccount();
    const { instance } = service({
      registry: {
        revokeAll: async () => {
          throw new Error('session registry unavailable');
        },
      },
    });

    try {
      const result = await instance.execute({ subjectId: actorUserId, sessionId: null }, {});

      // The enforcement half is in the database even though every accelerator
      // call failed: a token that existed before this run no longer validates.
      for (const account of [first, second]) {
        const state = await rowState(account.userId, account.sessionIds);
        expect(state.mustChangePassword).toBe(true);
        expect(state.cutoff).not.toBeNull();
        expect(state.sessionRevoked).toBe(true);
        expect(state.sessionReason).toBe('admin');
      }

      // Nothing was left *usable*, so nothing counts as failed — but the run is
      // not finished and the caller learns that instead of a lazy 200.
      expect(result).toMatchObject({
        eligibleUsers: baseline + 2,
        failedUsers: 0,
        pendingUsers: baseline + 2,
        status: 'PARTIAL',
      });

      const entry = await prisma.auditLog.findFirst({
        where: { action: auditLogActions.authAdminBulkPasswordReset, entityId: actorUserId },
      });
      expect(entry?.metadata).toMatchObject({
        pendingUsers: baseline + 2,
        status: 'PARTIAL',
      });
    } finally {
      await cleanup(first.userId);
      await cleanup(second.userId);
    }
  });

  it('rolls a failing target back whole and never claims its session was revoked', async () => {
    const healthy = await seedAccount();
    const broken = await seedAccount();

    /*
      Real PostgreSQL, one injected fault: `userSession.updateMany` fails only for
      the "broken" target. The flag and the cutoff have already been written inside
      that transaction when it throws, so this proves the rollback — not just the
      absence of a call.
    */
    const faulty = {
      user: prisma.user,
      // The outbox is not what this case faults: only `userSession` throws.
      outboxMessage: prisma.outboxMessage,
      $transaction: (run: (client: unknown) => Promise<unknown>) =>
        prisma.$transaction(async (transaction) => {
          /*
            Override exactly one delegate. Every other property is read from the
            real transaction client (`Reflect.get` without a receiver, functions
            bound to it), because Prisma's interactive-transaction client keeps
            private fields that a proxy receiver cannot reach.
          */
          const guarded = new Proxy(transaction as object, {
            get(target, property) {
              if (property === 'userSession') {
                return {
                  updateMany: async (args: { where: { userId: string } }) => {
                    if (args.where.userId === broken.userId) {
                      throw new Error('injected database fault');
                    }
                    return transaction.userSession.updateMany(args as never);
                  },
                };
              }
              const value = Reflect.get(target, property) as unknown;
              return typeof value === 'function' ? value.bind(target) : value;
            },
          });
          return run(guarded);
        }),
    } as unknown as PrismaClient;

    const { instance, calls } = service({ database: faulty });

    try {
      const result = await instance.execute({ subjectId: actorUserId, sessionId: null }, {});

      const healthyState = await rowState(healthy.userId, healthy.sessionIds);
      expect(healthyState.mustChangePassword).toBe(true);
      expect(healthyState.sessionRevoked).toBe(true);

      // Rolled back whole: no flag, no cutoff, sessions still live, factor intact.
      const brokenState = await rowState(broken.userId, broken.sessionIds);
      expect(brokenState.mustChangePassword).toBe(false);
      expect(brokenState.cutoff).toBeNull();
      expect(brokenState.sessionRevoked).toBe(false);
      expect(brokenState.mfaRows).toBe(1);

      expect(result).toMatchObject({
        eligibleUsers: baseline + 2,
        changedUsers: baselineUnflagged + 1,
        failedUsers: 1,
        pendingUsers: 0,
        status: 'PARTIAL',
      });
      expect(result.revokedSessions).toBeGreaterThanOrEqual(2);
      // The failed target keeps working until a repeat run commits its block, so
      // pretending its accelerator ran would be a lie.
      expect(calls).toContain(healthy.userId);
      expect(calls).not.toContain(broken.userId);
    } finally {
      await cleanup(healthy.userId);
      await cleanup(broken.userId);
    }
  });
});
