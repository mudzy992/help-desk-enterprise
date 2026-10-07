jest.mock('../../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));

import { createHash, randomBytes } from 'node:crypto';
import { defaultAccountSecurityPolicy } from './account-security-policy';
import { MfaService } from './mfa.service';
import {
  deriveRecoveryCodeHmacKey,
  hashRecoveryCode,
  normalizeRecoveryCode,
  recoveryCodeHmacKeyId,
} from './recovery-codes';

const subject = {
  id: 'user-1',
  email: 'user@example.test',
  roleKeys: ['ADMIN'],
  localPasswordHash: 'bcrypt-hash',
  entraObjectId: null,
};
const recoveryCode = 'abcde-fghjk';

describe('MFA recovery-code HMAC verification', () => {
  const oldCurrent = process.env.MFA_ENCRYPTION_KEY;
  const oldPrevious = process.env.MFA_ENCRYPTION_KEY_PREVIOUS;
  const currentKey = randomBytes(32);
  const previousKey = randomBytes(32);

  afterEach(() => {
    if (oldCurrent === undefined) delete process.env.MFA_ENCRYPTION_KEY;
    else process.env.MFA_ENCRYPTION_KEY = oldCurrent;
    if (oldPrevious === undefined) delete process.env.MFA_ENCRYPTION_KEY_PREVIOUS;
    else process.env.MFA_ENCRYPTION_KEY_PREVIOUS = oldPrevious;
  });

  function makeService(input: {
    readonly hashes: readonly { id: string; codeHash: string; keyId: string; usedAt: Date | null }[];
    readonly updateCount?: number;
  }) {
    const hashes = input.hashes.map((row) => ({ ...row }));
    const notifier = { audit: jest.fn().mockResolvedValue(undefined), notify: jest.fn().mockResolvedValue(undefined) };
    const userMfaRecoveryCode = {
      findMany: jest.fn(async ({ where }: { where: { keyId: { in: string[] } } }) => {
        const available = new Set(where.keyId.in);
        return hashes
          .filter((row) => row.usedAt === null && available.has(row.keyId))
          .map(({ id, codeHash, keyId }) => ({ id, codeHash, keyId }));
      }),
      updateMany: jest.fn(async ({ where, data }: { where: { id: string; userId: string; usedAt: null }; data: { usedAt: Date } }) => {
        const row = hashes.find((item) => item.id === where.id && item.usedAt === null);
        if (!row || input.updateCount === 0) return { count: 0 };
        row.usedAt = data.usedAt;
        return { count: 1 };
      }),
      count: jest.fn(async ({ where }: { where: { keyId: { in: string[] } } }) => {
        const available = new Set(where.keyId.in);
        return hashes.filter((row) => row.usedAt === null && available.has(row.keyId)).length;
      }),
    };
    const prisma = {
      userMfa: {
        findUnique: jest.fn().mockResolvedValue({
          userId: subject.id,
          enabledAt: new Date('2026-01-01T00:00:00.000Z'),
          secretEncrypted: 'not-read-for-recovery-code',
          lastUsedStep: null,
        }),
        updateMany: jest.fn(),
      },
      userMfaRecoveryCode,
    };
    return {
      service: new MfaService(prisma as never, notifier as never),
      prisma,
      notifier,
      hashes,
      userMfaRecoveryCode,
    };
  }

  it('accepts a current-key HMAC once and atomically marks that exact row used', async () => {
    process.env.MFA_ENCRYPTION_KEY = currentKey.toString('base64');
    delete process.env.MFA_ENCRYPTION_KEY_PREVIOUS;
    const hmacKey = deriveRecoveryCodeHmacKey(currentKey);
    const { service, userMfaRecoveryCode, notifier, hashes } = makeService({
      hashes: [{
        id: 'code-row-1',
        codeHash: hashRecoveryCode(recoveryCode, hmacKey),
        keyId: recoveryCodeHmacKeyId(currentKey),
        usedAt: null,
      }],
    });

    await expect(service.verify(subject, ' ABCDE FGHJK ')).resolves.toBe('recovery');
    expect(userMfaRecoveryCode.updateMany).toHaveBeenCalledWith({
      where: { id: 'code-row-1', userId: subject.id, usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
    expect(hashes[0]?.usedAt).toBeInstanceOf(Date);
    expect(notifier.audit).toHaveBeenCalledTimes(1);
    await expect(service.verify(subject, recoveryCode)).rejects.toMatchObject({
      code: 'MFA_RECOVERY_CODES_EXHAUSTED',
    });
  });

  it('verifies a previous-key HMAC during key rotation', async () => {
    process.env.MFA_ENCRYPTION_KEY = currentKey.toString('base64');
    process.env.MFA_ENCRYPTION_KEY_PREVIOUS = previousKey.toString('base64');
    const previousHmacKey = deriveRecoveryCodeHmacKey(previousKey);
    const { service } = makeService({
      hashes: [{
        id: 'old-code',
        codeHash: hashRecoveryCode(recoveryCode, previousHmacKey),
        keyId: recoveryCodeHmacKeyId(previousKey),
        usedAt: null,
      }],
    });
    await expect(service.verify(subject, recoveryCode)).resolves.toBe('recovery');
  });

  it('does not report or accept codes from a removed previous key', async () => {
    process.env.MFA_ENCRYPTION_KEY = currentKey.toString('base64');
    delete process.env.MFA_ENCRYPTION_KEY_PREVIOUS;
    const { service, userMfaRecoveryCode } = makeService({
      hashes: [{
        id: 'previous-key-code',
        codeHash: hashRecoveryCode(recoveryCode, deriveRecoveryCodeHmacKey(previousKey)),
        keyId: recoveryCodeHmacKeyId(previousKey),
        usedAt: null,
      }],
    });

    await expect(service.verify(subject, recoveryCode)).rejects.toMatchObject({
      code: 'MFA_RECOVERY_CODES_EXHAUSTED',
    });
    const status = await service.status(subject, defaultAccountSecurityPolicy);
    expect(status.recoveryCodesRemaining).toBe(0);
    expect(userMfaRecoveryCode.updateMany).not.toHaveBeenCalled();
  });

  it('refuses an old plain SHA-256 database hash and never consumes it', async () => {
    process.env.MFA_ENCRYPTION_KEY = currentKey.toString('base64');
    delete process.env.MFA_ENCRYPTION_KEY_PREVIOUS;
    const legacySha256 = createHash('sha256').update(normalizeRecoveryCode(recoveryCode)).digest('hex');
    const { service, userMfaRecoveryCode } = makeService({
      hashes: [{
        id: 'legacy-code',
        codeHash: legacySha256,
        keyId: recoveryCodeHmacKeyId(currentKey),
        usedAt: null,
      }],
    });
    await expect(service.verify(subject, recoveryCode)).rejects.toMatchObject({ code: 'MFA_INVALID_CODE' });
    expect(userMfaRecoveryCode.updateMany).not.toHaveBeenCalled();
  });

  it('fails closed when neither the current nor the previous HMAC key is configured', async () => {
    delete process.env.MFA_ENCRYPTION_KEY;
    delete process.env.MFA_ENCRYPTION_KEY_PREVIOUS;
    const { service, userMfaRecoveryCode } = makeService({ hashes: [] });
    await expect(service.verify(subject, recoveryCode)).rejects.toMatchObject({ code: 'MFA_UNAVAILABLE' });
    expect(userMfaRecoveryCode.findMany).not.toHaveBeenCalled();
  });
});
