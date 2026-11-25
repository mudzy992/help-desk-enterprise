import { randomBytes } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { defaultAccountSecurityPolicy } from './security/account-security-policy.loader';
import { MfaService } from './security/mfa.service';
import { totpCode } from './security/totp';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

/*
  W2.16 (`BA-authentication-03`): the unit specs run against an in-memory fake, so
  they can only prove the shape of the predicates. These two cases run the same
  code against real PostgreSQL, where the atomicity actually lives:
    - the claim table's primary key decides the winner of a replay (INSERT), not
      an application-level check;
    - the enrollment compare-and-set serialises two confirmations, so one session
      and one recovery set come out of a race that used to produce two.
*/
describeIfDatabase('durable MFA token claim (integration)', () => {
  let prisma: PrismaClient;
  let mfa: MfaService;
  const stamp = Date.now();

  const previousKey = process.env.MFA_ENCRYPTION_KEY;
  beforeAll(() => {
    // The suite owns its key: CI does not hand one to the integration job, and the
    // enrollment path encrypts the pending secret before it writes.
    process.env.MFA_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    mfa = new MfaService(prisma as never, {
      audit: async () => undefined,
      notify: async () => undefined,
    } as never);
  });

  afterAll(async () => {
    await prisma.mfaTokenClaim.deleteMany({ where: { subjectId: { startsWith: `mfa-it-${stamp}` } } });
    await prisma.user.deleteMany({ where: { email: { contains: `mfa-it-${stamp}` } } });
    await prisma.$disconnect();
    process.env.MFA_ENCRYPTION_KEY = previousKey;
  });

  async function user(): Promise<{ id: string; email: string; localPasswordHash: string | null; entraObjectId: string | null; roleKeys: string[] }> {
    const suffix = randomBytes(6).toString('hex');
    const created = await prisma.user.create({
      data: { email: `mfa-it-${stamp}-${suffix}@example.invalid`, displayName: 'MFA claim fixture' },
    });
    return {
      id: created.id,
      email: created.email,
      localPasswordHash: 'hash',
      entraObjectId: null,
      roleKeys: ['ADMIN'],
    };
  }

  it('hands the same jti to exactly one of two parallel requests, and never again after use', async () => {
    const jti = `mfa-it-${stamp}-${randomBytes(6).toString('hex')}`;
    const subjectId = `mfa-it-${stamp}`;

    const results = await Promise.all([
      mfa.claimSignInToken(jti, subjectId, 'verify'),
      mfa.claimSignInToken(jti, subjectId, 'verify'),
    ]);

    // The unique primary key does the arbitration: one INSERT wins, the other
    // reads P2002 and reports a lost claim instead of an exception.
    expect(results.filter(Boolean)).toHaveLength(1);
    await expect(prisma.mfaTokenClaim.count({ where: { jti } })).resolves.toBe(1);

    await mfa.consumeSignInToken(jti);
    await expect(mfa.claimSignInToken(jti, subjectId, 'verify')).resolves.toBe(false);
    // A consumed claim is never released back into the wild.
    await mfa.releaseSignInToken(jti);
    await expect(mfa.claimSignInToken(jti, subjectId, 'verify')).resolves.toBe(false);
  });

  it('lets exactly one of two parallel enrollment confirmations win, with one recovery set', async () => {
    const subject = await user();
    const started = await mfa.startEnrollment(subject, defaultAccountSecurityPolicy);
    const code = totpCode(started.secret, Date.now());

    const results = await Promise.allSettled([
      mfa.confirmEnrollment(subject, code),
      mfa.confirmEnrollment(subject, code),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toMatchObject({ code: 'MFA_ALREADY_ENABLED' });

    const row = await prisma.userMfa.findUnique({ where: { userId: subject.id } });
    expect(row?.enabledAt).not.toBeNull();
    expect(row?.pendingSecretEncrypted).toBeNull();
    // One set of ten, written inside the winning transaction — the loser wrote none.
    await expect(
      prisma.userMfaRecoveryCode.count({ where: { userId: subject.id } }),
    ).resolves.toBe(10);
    // `status()` counts what a user could still redeem, i.e. the set the winner wrote.
    await expect(mfa.status(subject, defaultAccountSecurityPolicy)).resolves.toMatchObject({
      enabled: true,
      recoveryCodesRemaining: 10,
    });
  });
});
