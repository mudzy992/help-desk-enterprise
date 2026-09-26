import { randomBytes } from 'node:crypto';
import { decodeBase32, encodeBase32 } from './base32';
import { buildOtpauthUri, hotp, totpCode, totpStep, verifyTotp } from './totp';
import { decryptMfaSecret, encryptMfaSecret, MfaEncryptionKeyMissingError, readMfaEncryptionKey } from './mfa-secret-cipher';
import { generateRecoveryCodes, hashRecoveryCode, looksLikeRecoveryCode } from './recovery-codes';
import { truncateIpAddress } from './network-prefix';
import { checkPassword } from './password-policy';
import { defaultAccountSecurityPolicy as policy } from './account-security-policy';
import { isPasswordExpired, passwordExpiresAt, resolveMfaRequirement } from './account-security-rules';

const rfcSecret = Buffer.from('12345678901234567890', 'ascii');

describe('HOTP / TOTP (RFC 4226, RFC 6238)', () => {
  it('matches the RFC 4226 HOTP vectors', () => {
    expect([0, 1, 2, 3, 4].map((counter) => hotp(rfcSecret, counter))).toEqual([
      '755224', '287082', '359152', '969429', '338314',
    ]);
  });

  it.each([
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ])('matches the RFC 6238 SHA-1 vector at T=%s', (seconds, expected) => {
    expect(hotp(rfcSecret, totpStep(seconds * 1000), 8)).toBe(expected);
  });

  it('round-trips base32', () => {
    const bytes = randomBytes(20);
    expect(decodeBase32(encodeBase32(bytes)).equals(bytes)).toBe(true);
    expect(encodeBase32(rfcSecret)).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  });

  it('accepts ±1 step and refuses replay of the same or an older step', () => {
    const secret = encodeBase32(rfcSecret);
    const now = 1_700_000_000_000;
    const step = totpStep(now);
    const code = totpCode(secret, now);
    expect(verifyTotp({ base32Secret: secret, code, nowMilliseconds: now, lastUsedStep: null })).toBe(step);
    expect(verifyTotp({ base32Secret: secret, code, nowMilliseconds: now + 30_000, lastUsedStep: null })).toBe(step);
    expect(verifyTotp({ base32Secret: secret, code, nowMilliseconds: now + 90_000, lastUsedStep: null })).toBeNull();
    expect(verifyTotp({ base32Secret: secret, code, nowMilliseconds: now, lastUsedStep: step })).toBeNull();
    expect(verifyTotp({ base32Secret: secret, code: 'abcdef', nowMilliseconds: now, lastUsedStep: null })).toBeNull();
  });

  it('builds an otpauth URI authenticator apps understand', () => {
    const uri = buildOtpauthUri({ issuer: 'EP HelpDesk', accountName: 'a@b.ba', base32Secret: 'ABC' });
    expect(uri).toBe('otpauth://totp/EP%20HelpDesk:a%40b.ba?secret=ABC&issuer=EP+HelpDesk&algorithm=SHA1&digits=6&period=30');
  });
});

describe('MFA secret cipher', () => {
  const key = randomBytes(32);

  it('encrypts with a fresh IV and decrypts back', () => {
    const a = encryptMfaSecret('SECRET', key);
    const b = encryptMfaSecret('SECRET', key);
    expect(a).not.toBe(b);
    expect(a.startsWith('v1:')).toBe(true);
    expect(decryptMfaSecret(a, key)).toBe('SECRET');
  });

  it('rejects a tampered ciphertext and a wrong key', () => {
    const stored = encryptMfaSecret('SECRET', key);
    const parts = stored.split(':');
    const tampered = [...parts.slice(0, 3), Buffer.from('X').toString('base64')].join(':');
    expect(() => decryptMfaSecret(tampered, key)).toThrow();
    expect(() => decryptMfaSecret(stored, randomBytes(32))).toThrow();
  });

  it('requires a 32-byte key', () => {
    expect(readMfaEncryptionKey(undefined)).toBeNull();
    expect(readMfaEncryptionKey(Buffer.alloc(16).toString('base64'))).toBeNull();
    expect(readMfaEncryptionKey(key.toString('base64'))?.equals(key)).toBe(true);
    expect(() => encryptMfaSecret('x', null)).toThrow(MfaEncryptionKeyMissingError);
  });
});

describe('recovery codes', () => {
  it('generates 10 distinct codes in the xxxxx-xxxxx shape', () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    codes.forEach((code) => expect(code).toMatch(/^[a-z2-9]{5}-[a-z2-9]{5}$/));
  });

  it('hashes case- and separator-insensitively and is told apart from a TOTP', () => {
    expect(hashRecoveryCode('abcde-fghjk')).toBe(hashRecoveryCode(' ABCDE FGHJK '));
    expect(looksLikeRecoveryCode('abcde-fghjk')).toBe(true);
    expect(looksLikeRecoveryCode('123456')).toBe(false);
  });
});

describe('IP prefix (privacy)', () => {
  it('keeps /24 of IPv4 and /48 of IPv6', () => {
    expect(truncateIpAddress('10.20.30.40')).toBe('10.20.30.0/24');
    expect(truncateIpAddress('::ffff:192.168.1.9')).toBe('192.168.1.0/24');
    expect(truncateIpAddress('2001:db8:abcd:12::1')).toBe('2001:db8:abcd::/48');
    expect(truncateIpAddress('not-an-ip')).toBeNull();
    expect(truncateIpAddress(null)).toBeNull();
  });
});

describe('password policy', () => {
  const rules = { minLength: 12, maxLength: 128, blocklistEnabled: true };

  it('accepts a long passphrase', () => {
    expect(checkPassword('correct-horse-battery', 'amar.hodzic@epbih.ba', rules)).toEqual([]);
  });

  it('refuses common passwords, also with a year and symbol appended', () => {
    expect(checkPassword('password1234', 'x@y.ba', rules)).toContain('COMMON_PASSWORD');
    expect(checkPassword('Sunshine2026!', 'x@y.ba', rules)).toContain('COMMON_PASSWORD');
  });

  it('refuses organisation words and parts of the own e-mail', () => {
    expect(checkPassword('Elektroprivreda#77', 'x@y.ba', rules)).toContain('CONTAINS_ORGANISATION_WORD');
    expect(checkPassword('hodzic-plavi-most', 'amar.hodzic@epbih.ba', rules)).toContain('CONTAINS_EMAIL_NAME');
  });

  it('checks length independent of the blocklist switch', () => {
    expect(checkPassword('short', 'x@y.ba', { ...rules, blocklistEnabled: false })).toEqual(['TOO_SHORT']);
  });
});

describe('account security rules', () => {
  const local = { hasLocalPassword: true, entraObjectId: null };

  it('requires MFA for SUPER_ADMIN always and for ADMIN by setting', () => {
    expect(resolveMfaRequirement({ ...local, roleKeys: ['SUPER_ADMIN'] }, { ...policy, mfaRequiredForAdmins: false })).toBe('required');
    expect(resolveMfaRequirement({ ...local, roleKeys: ['ADMIN'] }, policy)).toBe('required');
    expect(resolveMfaRequirement({ ...local, roleKeys: ['ADMIN'] }, { ...policy, mfaRequiredForAdmins: false })).toBe('optional');
    expect(resolveMfaRequirement({ ...local, roleKeys: ['AGENT'] }, { ...policy, mfaAllowOptional: false })).toBe('unavailable');
  });

  it('never offers MFA to an account without a local password (Entra)', () => {
    expect(resolveMfaRequirement({ roleKeys: ['ADMIN'], hasLocalPassword: false, entraObjectId: 'oid' }, policy)).toBe('unavailable');
  });

  it('expires only the SUPER_ADMIN password by default (365 d)', () => {
    const changed = new Date('2025-01-01T00:00:00Z');
    expect(passwordExpiresAt({ roleKeys: ['AGENT'], passwordChangedAt: changed }, policy)).toBeNull();
    expect(passwordExpiresAt({ roleKeys: ['SUPER_ADMIN'], passwordChangedAt: changed }, policy)?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(isPasswordExpired({ roleKeys: ['SUPER_ADMIN'], passwordChangedAt: changed }, policy, new Date('2025-12-31T00:00:00Z'))).toBe(false);
    expect(isPasswordExpired({ roleKeys: ['SUPER_ADMIN'], passwordChangedAt: changed }, policy, new Date('2026-01-02T00:00:00Z'))).toBe(true);
    expect(isPasswordExpired({ roleKeys: ['SUPER_ADMIN'], passwordChangedAt: null }, policy)).toBe(false);
  });
});
