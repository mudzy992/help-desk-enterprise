import { createHmac, hkdfSync, randomInt, timingSafeEqual } from 'node:crypto';

/** Paket 5.2.1 (M2 #4): 10 single-use recovery codes, stored as HMAC-SHA-256 only. */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // no 0/o, 1/l/i
export const recoveryCodeCount = 10;

export function generateRecoveryCodes(count: number = recoveryCodeCount): string[] {
  return Array.from({ length: count }, () => {
    let code = '';
    for (let index = 0; index < 10; index += 1) {
      code += ALPHABET[randomInt(ALPHABET.length)];
    }
    return `${code.slice(0, 5)}-${code.slice(5)}`;
  });
}

export function normalizeRecoveryCode(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Domain-separated HMAC key derived from the active MFA encryption key. */
export function deriveRecoveryCodeHmacKey(mfaEncryptionKey: Buffer): Buffer {
  return Buffer.from(
    hkdfSync(
      'sha256',
      mfaEncryptionKey,
      Buffer.from('help-desk-enterprise:mfa-recovery-code:v1', 'utf8'),
      Buffer.from('single-use-code-hmac-sha256', 'utf8'),
      32,
    ),
  );
}

/** Non-secret lookup tag so rows remain tied to the key that created them. */
export function recoveryCodeHmacKeyId(mfaEncryptionKey: Buffer): string {
  return createHmac('sha256', deriveRecoveryCodeHmacKey(mfaEncryptionKey))
    .update('help-desk-enterprise:mfa-recovery-code-key-id:v1', 'utf8')
    .digest('hex');
}

export type RecoveryCodeHmacKey = {
  readonly key: Buffer;
  readonly keyId: string;
};

/** Active key first, previous rotation key second; duplicate keys are removed. */
export function deriveRecoveryCodeHmacKeyCandidates(
  currentMfaKey: Buffer | null,
  previousMfaKey: Buffer | null,
): readonly RecoveryCodeHmacKey[] {
  const sourceKeys = [currentMfaKey, previousMfaKey].filter(
    (key): key is Buffer => key !== null,
  );
  const uniqueKeys = sourceKeys.filter(
    (key, index) => sourceKeys.findIndex((candidate) => candidate.equals(key)) === index,
  );
  return uniqueKeys.map((mfaKey) => ({
    key: deriveRecoveryCodeHmacKey(mfaKey),
    keyId: recoveryCodeHmacKeyId(mfaKey),
  }));
}

export function deriveRecoveryCodeHmacKeys(
  currentMfaKey: Buffer | null,
  previousMfaKey: Buffer | null,
): readonly Buffer[] {
  return deriveRecoveryCodeHmacKeyCandidates(currentMfaKey, previousMfaKey).map(({ key }) => key);
}

export function hashRecoveryCode(input: string, hmacKey: Buffer): string {
  return createHmac('sha256', hmacKey)
    .update(normalizeRecoveryCode(input), 'utf8')
    .digest('hex');
}

/** Fixed-length digest comparison that does not exit on the first differing byte. */
export function recoveryCodeHashMatches(storedHex: string, candidateHex: string): boolean {
  const stored = Buffer.from(storedHex, 'hex');
  const candidate = Buffer.from(candidateHex, 'hex');
  if (
    stored.length !== 32 ||
    candidate.length !== 32 ||
    stored.toString('hex') !== storedHex.toLowerCase() ||
    candidate.toString('hex') !== candidateHex.toLowerCase()
  ) {
    return false;
  }
  return timingSafeEqual(stored, candidate);
}

export function looksLikeRecoveryCode(input: string): boolean {
  // Accept the generated five-five shape, with up to three spaces/hyphens for
  // copy/paste tolerance. Other punctuation is invalid rather than normalized.
  return /^[a-z0-9]{5}[- ]{0,3}[a-z0-9]{5}$/i.test(input.trim());
}
