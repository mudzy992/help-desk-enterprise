import { kdfLabels } from '../../common/crypto/kdf-labels';
import { legacyKdfLabels } from '../../common/crypto/legacy-kdf-labels';
import { hkdfSync } from 'node:crypto';
import { decryptMfaSecret, encryptMfaSecret, readMfaEncryptionKey } from '../authentication/security/mfa-secret-cipher';

/**
 * Paket 3.2 (§9): licence keys are stored with AES-256-GCM under a key
 * derived (HKDF) from MFA_ENCRYPTION_KEY, so no new secret has to be
 * provisioned. Without that key a licence key cannot be saved or shown.
 */
export function readLicenseKeyCipherKey(env: NodeJS.ProcessEnv = process.env): Buffer | null {
  return deriveLicenseKey(env, kdfLabels.assetLicenseKey);
}

/** Paket 4.1 (§5): v2 first, then the v1 key for licences written before v2. */
export function readLicenseKeyDecryptionKeys(env: NodeJS.ProcessEnv = process.env): Buffer[] {
  const keys = [deriveLicenseKey(env, kdfLabels.assetLicenseKey), deriveLicenseKey(env, legacyKdfLabels.assetLicenseKeyV1)];
  return keys.filter((key): key is Buffer => key !== null);
}

function deriveLicenseKey(env: NodeJS.ProcessEnv, label: string): Buffer | null {
  const master = readMfaEncryptionKey(env.MFA_ENCRYPTION_KEY);
  if (master === null) return null;
  return Buffer.from(hkdfSync('sha256', master, Buffer.alloc(0), label, 32));
}

export function encryptLicenseKey(plain: string, key: Buffer | null): string {
  return encryptMfaSecret(plain, key);
}

export function decryptLicenseKey(stored: string, keyOrKeys: Buffer | readonly Buffer[] | null): string {
  const keys = keyOrKeys === null ? [] : Buffer.isBuffer(keyOrKeys) ? [keyOrKeys] : keyOrKeys;
  if (keys.length === 0) return decryptMfaSecret(stored, null);
  let lastError: unknown;
  for (const key of keys) {
    try {
      return decryptMfaSecret(stored, key);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

/** True when the stored value only opens with a legacy key (needs `rekey-asset-licenses`). */
export function needsLicenseRekey(stored: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const current = readLicenseKeyCipherKey(env);
  if (current === null) return false;
  try {
    decryptMfaSecret(stored, current);
    return false;
  } catch {
    return true;
  }
}

/** Shows only the last 4 characters, e.g. `•••• 7QX2`. */
export function maskLicenseKey(plainLength: number, tail: string): string {
  return plainLength <= 4 ? '••••' : `•••• ${tail}`;
}
