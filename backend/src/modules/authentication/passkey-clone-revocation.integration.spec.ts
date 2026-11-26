import { createHash, randomBytes } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { PrismaClient } from '../../generated/prisma/client';
import { TransactionalOutboxService } from '../../common/outbox/transactional-outbox.service';
import { PrivilegedAuditService } from '../../common/privileged-audit/privileged-audit.service';
import { auditLogActions } from '../audit-log/audit-log.constants';
import { notificationTitleKeys, notificationTypes } from '../notifications/notifications.constants';
import { AccountSecurityError } from './security/account-security.error';
import { AccountSecurityNotifier } from './security/account-security-notifier';
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
  W2.21 (`BA-authentication-08`): the clone branch used to run
  `deleteMany({ where: { userId } })` — one cloned (or merely buggy) authenticator
  removed every passkey of the account. Unit specs can prove which call was made; only
  real PostgreSQL can prove which *rows* survived, that the audit entry was actually
  appended to the hash chain, and that the owner notification was materialised.
*/
describeIfDatabase('passkey clone revocation (integration)', () => {
  const rp = { rpID: 'helpdesk.example', expectedOrigins: ['https://helpdesk.example'], rpName: 'Service Desk' };
  const stamp = Date.now();

  let prisma: PrismaClient;
  let service: PasskeyCredentialService;
  let userId: string;
  /** W2.24: the real durable writer — the notifier no longer writes the row itself. */
  let privilegedAudit: PrivilegedAuditService;

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    const user = await prisma.user.create({
      data: {
        email: `passkey-clone-${stamp}@example.invalid`,
        displayName: 'Passkey clone fixture',
        localPasswordHash: 'x',
      },
    });
    userId = user.id;
    privilegedAudit = new PrivilegedAuditService(
      prisma as never,
      new TransactionalOutboxService(prisma as never),
    );
    service = new PasskeyCredentialService(
      prisma as never,
      new PasskeyChallengeStoreProvider(undefined),
      new AccountSecurityNotifier(prisma as never, privilegedAudit) as never,
    );
  });

  afterAll(async () => {
    if (userId) await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  async function credential(counter: bigint, deviceName: string | null): Promise<string> {
    const created = await prisma.userPasskeyCredential.create({
      data: {
        userId,
        credentialId: `cred-${randomBytes(6).toString('hex')}`,
        publicKey: toBase64Url(new Uint8Array([1, 2, 3])),
        counter,
        deviceName,
        aaguid: 'ad872465-8e5e-4ffa-8a25-4c22ee53ca8d',
      },
    });
    return created.credentialId;
  }

  it('removes only the cloned credential and keeps the incident auditable', async () => {
    const clonedId = await credential(BigInt(5), 'Cloned laptop');
    const survivorId = await credential(BigInt(7), 'Phone');

    // The authenticator presents a counter that is behind what we already stored.
    (verifyAuthenticationResponse as jest.Mock).mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 4 },
    });

    await service.startAuthentication(userId, passkeyLoginChallengeKey('jti-clone'), rp);
    await expect(
      service.verifyAssertion(userId, passkeyLoginChallengeKey('jti-clone'), { id: clonedId } as never, rp, false, null),
    ).rejects.toThrow(new AccountSecurityError('PASSKEY_CLONED'));

    // The offending credential is gone; the other passkey of the same account is not.
    await expect(prisma.userPasskeyCredential.findUnique({ where: { credentialId: clonedId } })).resolves.toBeNull();
    const survivor = await prisma.userPasskeyCredential.findUnique({ where: { credentialId: survivorId } });
    expect(survivor).not.toBeNull();
    // A clone must never move a surviving credential's counter backwards.
    expect(survivor?.counter).toBe(BigInt(7));
    await expect(prisma.userPasskeyCredential.count({ where: { userId } })).resolves.toBe(1);

    // The incident outlives the row it describes.
    const entry = await prisma.auditLog.findFirst({
      where: { action: auditLogActions.authMfaPasskeyCloneDetected, entityType: 'user', entityId: userId },
    });
    expect(entry).not.toBeNull();
    const metadata = entry?.metadata as Record<string, unknown>;
    expect(metadata).toMatchObject({
      aaguid: 'ad872465-8e5e-4ffa-8a25-4c22ee53ca8d',
      deviceName: 'Cloned laptop',
      presentedCounter: 4,
      storedCounter: 5,
      removed: 1,
      remainingPasskeys: 1,
    });
    // Fingerprint only — the raw credential id must not leak into the audit log.
    const expectedFingerprint = createHash('sha256').update(clonedId).digest('hex').slice(0, 16);
    expect(metadata.credentialFingerprint).toBe(expectedFingerprint);
    expect(JSON.stringify(metadata)).not.toContain(clonedId);

    // The owner is told which device has to be re-registered.
    const notification = await prisma.notification.findFirst({
      where: { userId, type: 'account.passkeyCloneDetected' },
    });
    expect(notification).not.toBeNull();
    expect(notification?.body).toBe('Cloned laptop');
    // The row stores the i18n key; the client renders it (bs/en labels added with this change).
    expect(notification?.title).toBe(notificationTitleKeys[notificationTypes.accountPasskeyCloneDetected]);
    expect(notification?.dedupeKey).toMatch(new RegExp(`^passkey-clone:${userId}:`));
  });
});
