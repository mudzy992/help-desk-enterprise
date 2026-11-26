import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { auditLogActions } from '../audit-log/audit-log.constants';
import { AccountSecurityNotifier } from '../authentication/security/account-security-notifier';
import {
  AccountSecurityBoundaryService,
  cutAccountCredentials,
} from '../authentication/security/account-security-boundary.service';
import { notificationTypes } from '../notifications/notifications.constants';
import { linkUserDirectoryIdentity } from './link-user-directory-identity';
import { unlinkUserDirectoryIdentity } from './unlink-user-directory-identity';
import { updateUser } from './update-user';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

/*
  W2.22 (`BA-users-03`): unit specs prove which calls are made; only real PostgreSQL
  proves the *state* — that a deactivation cannot commit without its durable revoke,
  and that both identity transitions leave no live session and no local factor.
*/
describeIfDatabase('account security transitions (integration)', () => {
  const stamp = `${process.pid}-${Date.now()}`;

  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /**
   * A boundary that keeps the durable half and skips the Redis accelerator. The
   * audit/notification half is the **real** `AccountSecurityNotifier`, so the rows
   * asserted below are the product's rows, not a recorder's memory (the first
   * version of this spec asserted `prisma.auditLog` while injecting a recording
   * fake — it could never pass, and only the registered runner found that).
   */
  function boundary(options: { redisDown?: boolean } = {}) {
    const sessionRegistry = {
      revokeAll: async () => {
        if (options.redisDown === true) throw new Error('redis down');
        return 0;
      },
    };
    const service = new AccountSecurityBoundaryService(
      sessionRegistry as never,
      new AccountSecurityNotifier(prisma as never),
    );
    return { service };
  }

  async function seedAccount(overrides: { isActive?: boolean; isLocalOnly?: boolean } = {}) {
    const user = await prisma.user.create({
      data: {
        email: `boundary-${stamp}-${Math.random().toString(36).slice(2, 8)}@example.invalid`,
        displayName: 'Boundary fixture',
        localPasswordHash: overrides.isLocalOnly === false ? null : 'x',
        isLocalOnly: overrides.isLocalOnly ?? true,
        isActive: overrides.isActive ?? true,
        tokensInvalidBeforeExceptJti: 'previous-exception',
      },
    });
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    const [firstSession, secondSession] = await Promise.all([
      prisma.userSession.create({ data: { userId: user.id, provider: 'local', expiresAt } }),
      prisma.userSession.create({ data: { userId: user.id, provider: 'local', expiresAt } }),
    ]);
    await prisma.userMfa.create({
      data: { userId: user.id, secretEncrypted: 'enc', enabledAt: new Date() },
    });
    await prisma.userMfaRecoveryCode.createMany({
      data: [
        { userId: user.id, codeHash: 'hash-1', keyId: 'k1' },
        { userId: user.id, codeHash: 'hash-2', keyId: 'k1' },
      ],
    });
    await prisma.userPasskeyCredential.create({
      data: { userId: user.id, credentialId: `cred-${stamp}-${Math.random()}`, publicKey: 'pk' },
    });
    return { user, sessions: [firstSession.id, secondSession.id] };
  }

  async function cleanup(userId: string) {
    // Cascades remove sessions/factors; audit rows are intentionally left (they are
    // the proof) and are scoped to this fixture's user id.
    await prisma.notification.deleteMany({ where: { userId } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    await prisma.auditLog.deleteMany({ where: { entityId: userId } });
  }

  it('deactivation commits the cutoff, the session revocations and the factor deletion together', async () => {
    const { user, sessions } = await seedAccount();
    const { service } = boundary();
    const revokedSessions: Array<{ userId: string; reason: string; actorUserId: string | null }> = [];
    (service as unknown as { sessionRegistry: { revokeAll: unknown } }).sessionRegistry = {
      revokeAll: async (input: { userId: string; reason: string; actorUserId: string | null }) => {
        revokedSessions.push({ userId: input.userId, reason: input.reason, actorUserId: input.actorUserId });
        return 2;
      },
    };

    try {
      await updateUser(
        prisma as never,
        { userId: user.id, isActive: false },
        async () => undefined,
        { actorUserId: null, requestId: 'w222-it' },
        service,
      );

      const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(stored.isActive).toBe(false);
      // Durable legacy-token cutoff, and no leftover exception token.
      expect(stored.tokensInvalidBefore).not.toBeNull();
      expect(stored.tokensInvalidBeforeExceptJti).toBeNull();

      const sessionRows = await prisma.userSession.findMany({ where: { id: { in: sessions } } });
      expect(sessionRows).toHaveLength(2);
      for (const row of sessionRows) {
        expect(row.revokedAt).not.toBeNull();
        expect(row.revokedReason).toBe('deactivated');
      }

      await expect(prisma.userMfa.count({ where: { userId: user.id } })).resolves.toBe(0);
      await expect(prisma.userMfaRecoveryCode.count({ where: { userId: user.id } })).resolves.toBe(0);
      await expect(prisma.userPasskeyCredential.count({ where: { userId: user.id } })).resolves.toBe(0);

      // The incident record survives the deactivation and names the transition.
      const entry = await prisma.auditLog.findFirst({
        where: { action: auditLogActions.authSecurityTransitionApplied, entityId: user.id },
      });
      expect(entry).not.toBeNull();
      expect(entry?.metadata).toMatchObject({
        transition: 'deactivated',
        sessions: 2,
        passkeys: 1,
        mfaFactors: 1,
        recoveryCodes: 2,
      });
      // The owner notification is a real row: the factor deletion must reach them.
      const notification = await prisma.notification.findFirst({
        where: { userId: user.id, type: notificationTypes.accountMfaChanged },
      });
      expect(notification).not.toBeNull();
      const cutoffAt = (entry?.metadata as { cutoffAt?: string } | null)?.cutoffAt;
      expect(typeof cutoffAt).toBe('string');
      expect(notification?.dedupeKey).toBe(
        `security-transition:${user.id}:deactivated:${cutoffAt}`,
      );
      expect(revokedSessions).toEqual([
        { userId: user.id, reason: 'deactivated', actorUserId: null },
      ]);
    } finally {
      await cleanup(user.id);
    }
  });

  it('rolls the whole deactivation back when the durable cut fails', async () => {
    const { user, sessions } = await seedAccount();
    const failing = {
      cutWithinTransaction: async (transaction: never, input: never) => {
        // Perform the real writes first, then fail: that is exactly the partial state
        // the acceptance forbids.
        await cutAccountCredentials(transaction, input as never);
        throw new Error('audit write failed');
      },
      afterCommit: async () => undefined,
    };

    try {
      await expect(
        updateUser(
          prisma as never,
          { userId: user.id, isActive: false },
          async () => undefined,
          { actorUserId: null, requestId: 'w222-fault' },
          failing as never,
        ),
      ).rejects.toThrow();

      const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(stored.isActive).toBe(true);
      expect(stored.tokensInvalidBefore).toBeNull();
      const sessionRows = await prisma.userSession.findMany({ where: { id: { in: sessions } } });
      expect(sessionRows.every((row) => row.revokedAt === null)).toBe(true);
      await expect(prisma.userMfa.count({ where: { userId: user.id } })).resolves.toBe(1);
      await expect(prisma.userPasskeyCredential.count({ where: { userId: user.id } })).resolves.toBe(1);
      await expect(
        prisma.auditLog.count({
          where: { action: auditLogActions.authSecurityTransitionApplied, entityId: user.id },
        }),
      ).resolves.toBe(0);
    } finally {
      await cleanup(user.id);
    }
  });

  it('linking to a directory identity leaves no local session, factor or password behind', async () => {
    const { user, sessions } = await seedAccount();
    const { service } = boundary({ redisDown: true });

    try {
      const directorySyncService = {
        listDirectoryUsersForLinking: async () => [
          { externalId: 'entra-oid-it', email: 'boundary@example.invalid', displayName: 'Boundary fixture' },
        ],
      };

      await linkUserDirectoryIdentity({
        prisma: prisma as never,
        directorySyncService: directorySyncService as never,
        userId: user.id,
        directoryExternalId: 'entra-oid-it',
        context: { actorUserId: null, requestId: 'w222-link' },
        securityBoundary: service,
      });

      const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(stored.isLocalOnly).toBe(false);
      expect(stored.entraObjectId).toBe('entra-oid-it');
      expect(stored.localPasswordHash).toBeNull();
      expect(stored.tokensInvalidBefore).not.toBeNull();

      const sessionRows = await prisma.userSession.findMany({ where: { id: { in: sessions } } });
      expect(sessionRows.every((row) => row.revokedReason === 'identity_link')).toBe(true);
      await expect(prisma.userMfa.count({ where: { userId: user.id } })).resolves.toBe(0);
      await expect(prisma.userPasskeyCredential.count({ where: { userId: user.id } })).resolves.toBe(0);

      // The volatile accelerator was down; the audit still lands on the durable half.
      const entry = await prisma.auditLog.findFirst({
        where: { action: auditLogActions.authSecurityTransitionApplied, entityId: user.id },
      });
      expect(entry?.metadata).toMatchObject({ transition: 'directory_linked', sessions: 2 });
    } finally {
      await cleanup(user.id);
    }
  });

  it('unlinking hands the account to the temporary password without the old sessions or factors', async () => {
    const { user, sessions } = await seedAccount({ isLocalOnly: false });
    await prisma.user.update({
      where: { id: user.id },
      data: { entraObjectId: 'entra-oid-unlink' },
    });
    const { service } = boundary();

    try {
      await unlinkUserDirectoryIdentity(
        prisma as never,
        user.id,
        {
          // Nothing is configured: the temporary password comes back for UI delivery,
          // so the test never needs an SMTP transport.
          settingsService: { getSetting: async () => null } as never,
          mailTransport: { send: async () => undefined } as never,
          securityBoundary: service,
        },
        { actorUserId: null, requestId: 'w222-unlink' },
      );

      const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(stored.isLocalOnly).toBe(true);
      expect(stored.entraObjectId).toBeNull();
      expect(stored.mustChangePassword).toBe(true);
      expect(stored.tokensInvalidBefore).not.toBeNull();

      const sessionRows = await prisma.userSession.findMany({ where: { id: { in: sessions } } });
      expect(sessionRows.every((row) => row.revokedReason === 'identity_unlink')).toBe(true);
      await expect(prisma.userMfa.count({ where: { userId: user.id } })).resolves.toBe(0);
      await expect(prisma.userPasskeyCredential.count({ where: { userId: user.id } })).resolves.toBe(0);

      const entry = await prisma.auditLog.findFirst({
        where: { action: auditLogActions.authSecurityTransitionApplied, entityId: user.id },
      });
      expect(entry?.metadata).toMatchObject({ transition: 'directory_unlinked', sessions: 2 });
    } finally {
      await cleanup(user.id);
    }
  });

  it('reactivation does not revive the tokens or the factors of the deactivated account', async () => {
    const { user } = await seedAccount();
    const { service } = boundary();

    try {
      await updateUser(
        prisma as never,
        { userId: user.id, isActive: false },
        async () => undefined,
        { actorUserId: null, requestId: 'w222-off' },
        service,
      );
      const deactivated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(deactivated.tokensInvalidBefore).not.toBeNull();

      await updateUser(
        prisma as never,
        { userId: user.id, isActive: true },
        async () => undefined,
        { actorUserId: null, requestId: 'w222-on' },
        service,
      );

      const reactivated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(reactivated.isActive).toBe(true);
      // The cutoff is not lifted: every token minted before the deactivation stays dead.
      expect(reactivated.tokensInvalidBefore).toEqual(deactivated.tokensInvalidBefore);
      expect(reactivated.tokensInvalidBeforeExceptJti).toBeNull();
      // Nor do the wiped factors come back.
      await expect(prisma.userMfa.count({ where: { userId: user.id } })).resolves.toBe(0);
      await expect(prisma.userPasskeyCredential.count({ where: { userId: user.id } })).resolves.toBe(0);
    } finally {
      await cleanup(user.id);
    }
  });
});
