import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/*
  Paket 2.1 (M1): TOTP secrets are encrypted at rest with AES-256-GCM.
  Key: MFA_ENCRYPTION_KEY = 32 random bytes, base64 (openssl rand -base64 32).
  Stored format: "v1:<iv b64>:<tag b64>:<ciphertext b64>".
*/
export class MfaEncryptionKeyMissingError extends Error {
  constructor() {
    super('MFA_ENCRYPTION_KEY is missing or not 32 bytes');
  }
}

export function readMfaEncryptionKey(raw: string | undefined = process.env.MFA_ENCRYPTION_KEY): Buffer | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const key = Buffer.from(trimmed, 'base64');
  return key.length === 32 ? key : null;
}

export function encryptMfaSecret(plain: string, key: Buffer | null): string {
  if (key === null) throw new MfaEncryptionKeyMissingError();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join(':');
}

export function decryptMfaSecret(stored: string, key: Buffer | null): string {
  if (key === null) throw new MfaEncryptionKeyMissingError();
  const [version, iv, tag, data] = stored.split(':');
  if (version !== 'v1' || !iv || !tag || data === undefined) {
    throw new Error('Unsupported MFA secret format');
  }
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}
