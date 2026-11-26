import { randomBytes } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { PrismaClient } from '../../generated/prisma/client';
import { AccountSecurityError } from './security/account-security.error';
import { PasskeyChallengeStoreProvider } from './security/passkey-challenge.store';
import { PasskeyCredentialService, passkeyLoginChallengeKey, toBase64Url } from './security/passkey-credential.service';

jest.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: jest.fn(),
  verifyRegistrationResponse: jest.fn(),
  generateAuthenticationOptions: jest.fn(async () => ({ challenge: 'integration-challenge' })),
  verifyAuthenticationResponse: jest.fn(),
}));

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

/*
  W2.18 (`BA-authentication-05`): the unit specs model the lost compare-and-set; only
  real PostgreSQL can prove the SQL predicate does the arbitration. Two ceremonies are
  held at a barrier *after* both have read the credential row, so both verified against
  the same starting counter — exactly the interleaving the audit describes.
*/
describeIfDatabase('passkey counter compare-and-set (integration)', () => {
  const rp = { rpID: 'helpdesk.example', expectedOrigins: ['https://helpdesk.example'], rpName: 'Service Desk' };
  const stamp = Date.now();

  let prisma: PrismaClient;
  let service: PasskeyCredentialService;
  let userId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    const user = await prisma.user.create({
      data: {
        email: `passkey-cas-${stamp}@example.invalid`,
        displayName: 'Passkey counter fixture',
        localPasswordHash: 'x',
      },
    });
    userId = user.id;
    service = new PasskeyCredentialService(
      prisma as never,
      new PasskeyChallengeStoreProvider(undefined),
      { audit: async () => undefined, notify: async () => undefined } as never,
    );
  });

  afterAll(async () => {
    if (userId) await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  async function credential(counter: bigint): Promise<string> {
    const created = await prisma.userPasskeyCredential.create({
      data: {
        userId,
        credentialId: `cred-${randomBytes(6).toString('hex')}`,
        publicKey: toBase64Url(new Uint8Array([1, 2, 3])),
        counter,
      },
    });
    return created.credentialId;
  }

  /** Holds the first two verifications until both have read the row. */
  function barrierVerification(newCounter: number): void {
    let arrived = 0;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    // Safety net: a single arrival must not hang the suite.
    const safety = setTimeout(release, 5_000);
    (verifyAuthenticationResponse as jest.Mock).mockImplementation(async () => {
      arrived += 1;
      if (arrived >= 2) {
        clearTimeout(safety);
        release();
      }
      await gate;
      return { verified: true, authenticationInfo: { newCounter } };
    });
  }

  it('lets one of two parallel ceremonies advance the counter and refuses the stale one', async () => {
    const before = await prisma.userPasskeyCredential.count({ where: { userId } });
    const credentialId = await credential(BigInt(5));
    barrierVerification(6);
    await service.startAuthentication(userId, passkeyLoginChallengeKey('jti-a'), rp);
    await service.startAuthentication(userId, passkeyLoginChallengeKey('jti-b'), rp);

    const results = await Promise.allSettled([
      service.verifyAssertion(userId, passkeyLoginChallengeKey('jti-a'), { id: credentialId } as never, rp, false, null),
      service.verifyAssertion(userId, passkeyLoginChallengeKey('jti-b'), { id: credentialId } as never, rp, false, null),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    // The loser is a stale duplicate, not a clone.
    expect(rejected[0]!.reason).toBeInstanceOf(AccountSecurityError);
    expect((rejected[0]!.reason as AccountSecurityError).code).toBe('MFA_INVALID_CODE');

    const stored = await prisma.userPasskeyCredential.findUnique({ where: { credentialId } });
    // The counter advanced exactly once and never went backwards.
    expect(stored?.counter).toBe(BigInt(6));
    expect(stored?.lastUsedAt).not.toBeNull();
    // A lost CAS must never wipe the factor (that is the clone answer, not this one):
    // the credential this ceremony used is still there, and no row disappeared.
    expect(stored).not.toBeNull();
    await expect(prisma.userPasskeyCredential.count({ where: { userId } })).resolves.toBe(before + 1);
  });

  it('keeps parallel sign-ins working for an authenticator without a counter', async () => {
    // WebAuthn: counter 0 means "not implemented", so there is nothing to compare and
    // nothing can regress. Refusing the second ceremony would lock those users out.
    const credentialId = await credential(BigInt(0));
    barrierVerification(0);
    await service.startAuthentication(userId, passkeyLoginChallengeKey('jti-c'), rp);
    await service.startAuthentication(userId, passkeyLoginChallengeKey('jti-d'), rp);

    const results = await Promise.allSettled([
      service.verifyAssertion(userId, passkeyLoginChallengeKey('jti-c'), { id: credentialId } as never, rp, false, null),
      service.verifyAssertion(userId, passkeyLoginChallengeKey('jti-d'), { id: credentialId } as never, rp, false, null),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(2);
    const stored = await prisma.userPasskeyCredential.findUnique({ where: { credentialId } });
    expect(stored?.counter).toBe(BigInt(0));
  });
});
