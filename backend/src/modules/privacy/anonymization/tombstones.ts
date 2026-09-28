import { createHash, createHmac } from 'node:crypto';
import { readMfaEncryptionKey } from '../../authentication/security/mfa-secret-cipher';

/**
 * Paket 2.6 (§6.4): HMACs of the identifiers of an anonymized person. They let
 * directory sync and Entra JIT recognise a returning person (a new account is
 * created, the admin is warned) without storing the identifiers themselves.
 * Key: PRIVACY_TOMBSTONE_KEY, or one derived from MFA_ENCRYPTION_KEY.
 */
export function readTombstoneKey(env: NodeJS.ProcessEnv = process.env): Buffer | null {
  const explicit = env.PRIVACY_TOMBSTONE_KEY?.trim();
  if (explicit !== undefined && explicit.length >= 16) return Buffer.from(explicit, 'utf8');
  const mfaKey = readMfaEncryptionKey(env.MFA_ENCRYPTION_KEY);
  if (mfaKey === null) return null;
  return createHash('sha256').update('ephelpdesk:privacy-tombstone:v1').update(mfaKey).digest();
}

export type TombstoneIdentifiers = {
  readonly email?: string | null;
  readonly directoryObjectGuid?: string | null;
  readonly entraObjectId?: string | null;
};

export function computeTombstones(key: Buffer, identifiers: TombstoneIdentifiers): string[] {
  const values: string[] = [];
  const add = (kind: string, value: string | null | undefined) => {
    const normalized = value?.trim().toLowerCase();
    if (normalized) values.push(createHmac('sha256', key).update(`${kind}:${normalized}`).digest('hex'));
  };
  add('email', identifiers.email);
  add('guid', identifiers.directoryObjectGuid);
  add('oid', identifiers.entraObjectId);
  return values;
}
