jest.mock('../../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));

import { randomBytes } from 'node:crypto';
import { defaultAccountSecurityPolicy } from './account-security-policy';
import { MfaService } from './mfa.service';
import { decryptMfaSecret, readMfaEncryptionKey } from './mfa-secret-cipher';
import { recoveryCodeCount } from './recovery-codes';
import { totpCode, verifyTotp } from './totp';

type Row = {
  userId: string;
  enabledAt: Date | null;
  secretEncrypted: string | null;
  pendingSecretEncrypted: string | null;
  pendingCreatedAt: Date | null;
  lastUsedStep: bigint | null;
  lastUsedAt: Date | null;
};

/** In-memory UserMfa with the same row semantics Postgres gives (unique userId, atomic updateMany). */
function fakePrisma() {
  const rows = new Map<string, Row>();
  const tick = () => new Promise((resolve) => setImmediate(resolve));
  // Predicate semantics of the real SQL: every field in `where` must match, and a
  // nested `{ lt | gt }` is a range, not equality. W2.16's compare-and-set relies
  // on exactly that, so the fake has to answer it the way Postgres would.
  const matches = (row: Row, where: Record<string, unknown>): boolean => {
    if (where.userId !== undefined && row.userId !== where.userId) return false;
    if ('enabledAt' in where) {
      if (where.enabledAt === null) {
        if (row.enabledAt !== null) return false;
      } else if (row.enabledAt?.getTime() !== (where.enabledAt as Date).getTime()) {
        return false;
      }
    }
    if ('pendingSecretEncrypted' in where && row.pendingSecretEncrypted !== where.pendingSecretEncrypted) {
      return false;
    }
    if ('pendingCreatedAt' in where) {
      const expected = where.pendingCreatedAt as null | { lt?: Date; gt?: Date };
      if (expected === null) {
        if (row.pendingCreatedAt !== null) return false;
      } else {
        if (row.pendingCreatedAt === null) return false;
        if (expected.lt !== undefined && !(row.pendingCreatedAt < expected.lt)) return false;
        if (expected.gt !== undefined && !(row.pendingCreatedAt > expected.gt)) return false;
      }
    }
    const or = where.OR as Record<string, unknown>[] | undefined;
    if (or === undefined) return true;
    return or.some((clause) => {
      if ('pendingSecretEncrypted' in clause) return row.pendingSecretEncrypted === null;
      const created = clause.pendingCreatedAt as null | { lt: Date };
      if (created === null) return row.pendingCreatedAt === null;
      return row.pendingCreatedAt !== null && row.pendingCreatedAt < created.lt;
    });
  };
  const userMfa = {
    findUnique: jest.fn(async ({ where }: { where: { userId: string } }) => {
      await tick();
      const row = rows.get(where.userId);
      return row === undefined ? null : { ...row };
    }),
    updateMany: jest.fn(async ({ where, data }: { where: Record<string, unknown>; data: Partial<Row> }) => {
      await tick();
      let count = 0;
      for (const row of rows.values()) {
        if (matches(row, where)) {
          Object.assign(row, data);
          count += 1;
        }
      }
      return { count };
    }),
    create: jest.fn(async ({ data }: { data: Partial<Row> & { userId: string } }) => {
      await tick();
      if (rows.has(data.userId)) throw Object.assign(new Error('unique'), { code: 'P2002' });
      const row: Row = {
        enabledAt: null,
        secretEncrypted: null,
        pendingSecretEncrypted: null,
        pendingCreatedAt: null,
        lastUsedStep: null,
        lastUsedAt: null,
        ...data,
      };
      rows.set(data.userId, row);
      return row;
    }),
  };
  // Recovery codes are part of the same transaction now: the loser of the race
  // must leave no half-written set behind.
  const recoveryCodes: { userId: string; codeHash: string; keyId: string }[] = [];
  const userMfaRecoveryCode = {
    deleteMany: jest.fn(async ({ where }: { where: { userId: string } }) => {
      await tick();
      let count = 0;
      for (let index = recoveryCodes.length - 1; index >= 0; index -= 1) {
        if (recoveryCodes[index]!.userId === where.userId) {
          recoveryCodes.splice(index, 1);
          count += 1;
        }
      }
      return { count };
    }),
    createMany: jest.fn(async ({ data }: { data: { userId: string; codeHash: string; keyId: string }[] }) => {
      await tick();
      recoveryCodes.push(...data.map((entry) => ({ ...entry })));
      return { count: data.length };
    }),
    count: jest.fn(async ({ where }: { where: { userId: string } }) => {
      await tick();
      return recoveryCodes.filter((entry) => entry.userId === where.userId).length;
    }),
  };
  const prisma = {
    userMfa,
    userMfaRecoveryCode,
    // The callback form is the one W2.16 needs (conditional writes inside a tx).
    $transaction: jest.fn(async (run: (tx: unknown) => Promise<unknown>) =>
      run({ userMfa, userMfaRecoveryCode }),
    ),
  };
  return { prisma, rows, recoveryCodes };
}

const subject = { id: 'u-1', email: 'amra@example.com', localPasswordHash: 'hash', entraObjectId: null, roleKeys: ['ADMIN'] };

describe('MfaService enrollment', () => {
  const previousKey = process.env.MFA_ENCRYPTION_KEY;
  beforeAll(() => {
    process.env.MFA_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  });
  afterAll(() => {
    process.env.MFA_ENCRYPTION_KEY = previousKey;
  });

  function service() {
    const fake = fakePrisma();
    const notifier = { audit: jest.fn(async () => undefined), notify: jest.fn(async () => undefined) };
    return { mfa: new MfaService(fake.prisma as never, notifier as never), ...fake };
  }

  it('returns the same secret to two parallel starts (StrictMode double mount)', async () => {
    const { mfa } = service();
    const [first, second] = await Promise.all([
      mfa.startEnrollment(subject, defaultAccountSecurityPolicy),
      mfa.startEnrollment(subject, defaultAccountSecurityPolicy),
    ]);
    expect(second.secret).toBe(first.secret);
    expect(second.otpauthUri).toBe(first.otpauthUri);
  });

  it('keeps the scanned secret on a later start (reload): the stored secret yields the phone code', async () => {
    const { mfa, rows } = service();
    const scanned = await mfa.startEnrollment(subject, defaultAccountSecurityPolicy);
    const reloaded = await mfa.startEnrollment(subject, defaultAccountSecurityPolicy);
    expect(reloaded.secret).toBe(scanned.secret);
    const stored = decryptMfaSecret(rows.get('u-1')!.pendingSecretEncrypted!, readMfaEncryptionKey());
    const now = Date.now();
    expect(verifyTotp({ base32Secret: stored, code: totpCode(scanned.secret, now), nowMilliseconds: now, lastUsedStep: null })).not.toBeNull();
  });

  it('issues a fresh secret once the pending one is close to expiry', async () => {
    const { mfa, rows } = service();
    const old = await mfa.startEnrollment(subject, defaultAccountSecurityPolicy);
    rows.get('u-1')!.pendingCreatedAt = new Date(Date.now() - 14 * 60 * 1000);
    const fresh = await mfa.startEnrollment(subject, defaultAccountSecurityPolicy);
    expect(fresh.secret).not.toBe(old.secret);
  });
});

/*
  W2.16 (`BA-authentication-03`): the confirmation used to be "read, then write",
  so two parallel confirmations both saw `enabledAt = null` and both minted a
  session and a fresh recovery set. The write is now the compare-and-set, and the
  codes are created inside that same transaction.
*/
describe('MfaService confirmation is a single-use compare-and-set (W2.16)', () => {
  const previousKey = process.env.MFA_ENCRYPTION_KEY;
  beforeAll(() => {
    process.env.MFA_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  });
  afterAll(() => {
    process.env.MFA_ENCRYPTION_KEY = previousKey;
  });

  const policy = defaultAccountSecurityPolicy;
  const subject = {
    id: 'u-cas',
    email: 'cas@example.com',
    localPasswordHash: 'hash',
    entraObjectId: null,
    roleKeys: ['ADMIN'],
  };

  function service() {
    const fake = fakePrisma();
    const notifier = { audit: jest.fn(async () => undefined), notify: jest.fn(async () => undefined) };
    return { mfa: new MfaService(fake.prisma as never, notifier as never), ...fake };
  }

  it('lets exactly one of two parallel confirmations win: one recovery set, one failure', async () => {
    const { mfa, recoveryCodes, prisma } = service();
    const started = await mfa.startEnrollment(subject, policy);
    const code = totpCode(started.secret, Date.now());

    const results = await Promise.allSettled([
      mfa.confirmEnrollment(subject, code),
      mfa.confirmEnrollment(subject, code),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ code: 'MFA_ALREADY_ENABLED' });
    // Exactly one set of ten, written by the winner only.
    expect(recoveryCodes).toHaveLength(recoveryCodeCount);
    await expect(
      prisma.userMfaRecoveryCode.count({ where: { userId: subject.id } }),
    ).resolves.toBe(recoveryCodeCount);
  });

  it('refuses a second confirmation through the same account, without a new set', async () => {
    const { mfa, recoveryCodes } = service();
    const started = await mfa.startEnrollment(subject, policy);
    const code = totpCode(started.secret, Date.now());

    await mfa.confirmEnrollment(subject, code);
    expect(recoveryCodes).toHaveLength(recoveryCodeCount);

    await expect(mfa.confirmEnrollment(subject, code)).rejects.toMatchObject({ code: 'MFA_ALREADY_ENABLED' });
    expect(recoveryCodes).toHaveLength(recoveryCodeCount);
  });

  it('writes no recovery codes when the compare-and-set loses to a concurrent enable', async () => {
    const { mfa, recoveryCodes, rows } = service();
    const started = await mfa.startEnrollment(subject, policy);
    const code = totpCode(started.secret, Date.now());
    // The other replica wins between our read of the pending row and our write.
    rows.get(subject.id)!.enabledAt = new Date();

    await expect(mfa.confirmEnrollment(subject, code)).rejects.toMatchObject({ code: 'MFA_ALREADY_ENABLED' });
    expect(recoveryCodes).toHaveLength(0);
  });
});

/*
  W2.16 (`BA-authentication-03`): the durable claim table, not the Redis marker,
  is the authority on "this MFA token was already used".
*/
describe('MfaService durable MFA token claim (W2.16)', () => {
  type Claim = { jti: string; subjectId: string; stage: string; claimedAt: Date; consumedAt: Date | null };

  function claimPrisma() {
    const rows = new Map<string, Claim>();
    const tick = () => new Promise((resolve) => setImmediate(resolve));
    const mfaTokenClaim = {
      create: jest.fn(async ({ data }: { data: Claim }) => {
        await tick();
        if (rows.has(data.jti)) throw Object.assign(new Error('unique constraint'), { code: 'P2002' });
        // The column defaults `consumedAt` to NULL; a JS `undefined` would silently
        // fail every `consumedAt: null` predicate below.
        const row: Claim = { ...data, consumedAt: data.consumedAt ?? null };
        rows.set(row.jti, row);
        return row;
      }),
      updateMany: jest.fn(
        async ({ where, data }: { where: { jti: string; consumedAt?: null; claimedAt?: { lt?: Date } }; data: Partial<Claim> }) => {
          await tick();
          let count = 0;
          for (const row of rows.values()) {
            if (row.jti !== where.jti) continue;
            if (where.consumedAt === null && row.consumedAt !== null) continue;
            if (where.claimedAt?.lt !== undefined && !(row.claimedAt < where.claimedAt.lt)) continue;
            Object.assign(row, data);
            count += 1;
          }
          return { count };
        },
      ),
      deleteMany: jest.fn(async ({ where }: { where: { jti?: string; consumedAt?: null; claimedAt?: { lt?: Date } } }) => {
        await tick();
        let count = 0;
        for (const [jti, row] of rows) {
          if (where.jti !== undefined && row.jti !== where.jti) continue;
          if (where.consumedAt === null && row.consumedAt !== null) continue;
          if (where.claimedAt?.lt !== undefined && !(row.claimedAt < where.claimedAt.lt)) continue;
          rows.delete(jti);
          count += 1;
        }
        return { count };
      }),
    };
    return { prisma: { mfaTokenClaim }, rows };
  }

  function service() {
    const fake = claimPrisma();
    const notifier = { audit: jest.fn(async () => undefined), notify: jest.fn(async () => undefined) };
    return { mfa: new MfaService(fake.prisma as never, notifier as never), ...fake };
  }

  it('lets exactly one of two requests claim the same jti', async () => {
    const { mfa } = service();
    const results = await Promise.all([
      mfa.claimSignInToken('jti-1', 'u-1', 'verify'),
      mfa.claimSignInToken('jti-1', 'u-1', 'verify'),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('refuses a replay of a consumed claim', async () => {
    const { mfa } = service();
    await expect(mfa.claimSignInToken('jti-1', 'u-1', 'verify')).resolves.toBe(true);
    await mfa.consumeSignInToken('jti-1');
    await expect(mfa.claimSignInToken('jti-1', 'u-1', 'verify')).resolves.toBe(false);
  });

  it('gives a rejected claim back, so the same token can be retried', async () => {
    const { mfa } = service();
    await mfa.claimSignInToken('jti-1', 'u-1', 'verify');
    await mfa.releaseSignInToken('jti-1');
    await expect(mfa.claimSignInToken('jti-1', 'u-1', 'verify')).resolves.toBe(true);
  });

  it('never releases a consumed claim', async () => {
    const { mfa, rows } = service();
    await mfa.claimSignInToken('jti-1', 'u-1', 'verify');
    await mfa.consumeSignInToken('jti-1');
    await mfa.releaseSignInToken('jti-1');
    expect(rows.has('jti-1')).toBe(true);
    await expect(mfa.claimSignInToken('jti-1', 'u-1', 'verify')).resolves.toBe(false);
  });

  it('takes over a claim abandoned inside the lease only, not an in-flight one', async () => {
    const { mfa, rows } = service();
    const now = Date.now();
    await mfa.claimSignInToken('jti-1', 'u-1', 'verify', new Date(now));
    // In flight (inside the 30 s lease): the second request must not steal it.
    await expect(mfa.claimSignInToken('jti-1', 'u-1', 'verify', new Date(now + 1_000))).resolves.toBe(false);
    // Crashed mid-flight (past the lease): the retry may proceed.
    await expect(mfa.claimSignInToken('jti-1', 'u-1', 'verify', new Date(now + 31_000))).resolves.toBe(true);
    expect(rows.get('jti-1')!.claimedAt.getTime()).toBe(now + 31_000);
  });

  it('trims claims past the retention window when a token is consumed', async () => {
    const { mfa, rows } = service();
    const now = Date.now();
    await mfa.claimSignInToken('stale-jti', 'u-1', 'verify', new Date(now - 25 * 60 * 60 * 1000));
    await mfa.claimSignInToken('fresh-jti', 'u-1', 'verify', new Date(now));
    await mfa.consumeSignInToken('fresh-jti', new Date(now));
    expect(rows.has('stale-jti')).toBe(false);
    expect(rows.has('fresh-jti')).toBe(true);
  });

  it('propagates a real database fault instead of treating it as a replay', async () => {
    const fake = claimPrisma();
    fake.prisma.mfaTokenClaim.create.mockRejectedValueOnce(Object.assign(new Error('connection lost'), { code: 'P1017' }));
    const notifier = { audit: jest.fn(async () => undefined), notify: jest.fn(async () => undefined) };
    const mfa = new MfaService(fake.prisma as never, notifier as never);
    await expect(mfa.claimSignInToken('jti-1', 'u-1', 'verify')).rejects.toThrow('connection lost');
  });
});
