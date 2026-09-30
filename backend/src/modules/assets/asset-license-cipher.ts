import { hkdfSync } from 'node:crypto';
import { decryptMfaSecret, encryptMfaSecret, readMfaEncryptionKey } from '../authentication/security/mfa-secret-cipher';

/**
 * Paket 3.2 (§9): licence keys are stored with AES-256-GCM under a key
 * derived (HKDF) from MFA_ENCRYPTION_KEY, so no new secret has to be
 * provisioned. Without that key a licence key cannot be saved or shown.
 */
export function readLicenseKeyCipherKey(env: NodeJS.ProcessEnv = process.env): Buffer | null {
  const master = readMfaEncryptionKey(env.MFA_ENCRYPTION_KEY);
  if (master === null) return null;
  return Buffer.from(hkdfSync('sha256', master, Buffer.alloc(0), 'ephelpdesk:asset-license-key:v1', 32));
}

export function encryptLicenseKey(plain: string, key: Buffer | null): string {
  return encryptMfaSecret(plain, key);
}

export function decryptLicenseKey(stored: string, key: Buffer | null): string {
  return decryptMfaSecret(stored, key);
}

/** Shows only the last 4 characters, e.g. `•••• 7QX2`. */
export function maskLicenseKey(plainLength: number, tail: string): string {
  return plainLength <= 4 ? '••••' : `•••• ${tail}`;
}
