import { createCipheriv, randomBytes } from 'node:crypto';

/** Same format as backend `mfa-secret-cipher.ts` (AES-256-GCM, v1:…). */
export function readMfaEncryptionKey(raw: string | undefined = process.env.MFA_ENCRYPTION_KEY): Buffer | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const key = Buffer.from(trimmed, 'base64');
  return key.length === 32 ? key : null;
}

export function encryptMfaSecret(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join(':');
}
