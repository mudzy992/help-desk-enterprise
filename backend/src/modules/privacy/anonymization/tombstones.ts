import { createHash, createHmac } from 'node:crypto';
import { kdfLabels } from '../../../common/crypto/kdf-labels';
import { legacyKdfLabels } from '../../../common/crypto/legacy-kdf-labels';
import { readExplicitSecret } from '../../../common/security/read-explicit-secret';
import { readMfaEncryptionKey } from '../../authentication/security/mfa-secret-cipher';

/**
 * Paket 2.6 (§6.4): HMACs of the identifiers of an anonymized person. They let
 * directory sync and Entra JIT recognise a returning person (a new account is
 * created, the admin is warned) without storing the identifiers themselves.
 * Key: PRIVACY_TOMBSTONE_KEY, or one derived from MFA_ENCRYPTION_KEY.
 */
export function readTombstoneKey(env: NodeJS.ProcessEnv = process.env): Buffer | null {
  const explicit = readExplicitSecret(env.PRIVACY_TOMBSTONE_KEY);
  if (explicit !== null) return explicit.bytes;
  return deriveTombstoneKey(env);
}

/** The key derived from MFA_ENCRYPTION_KEY (used when no explicit key is set). */
export function deriveTombstoneKey(env: NodeJS.ProcessEnv = process.env, label: string = kdfLabels.privacyTombstone): Buffer | null {
  const mfaKey = readMfaEncryptionKey(env.MFA_ENCRYPTION_KEY);
  if (mfaKey === null) return null;
  return createHash('sha256').update(label).update(mfaKey).digest();
}

/**
 * HMACs cannot be re-keyed, so after rotating PRIVACY_TOMBSTONE_KEY the old key
 * stays in PRIVACY_TOMBSTONE_KEY_PREVIOUS for matching existing tombstones.
 * New erasures always use the current key.
 */
export function readTombstoneMatchKeys(env: NodeJS.ProcessEnv = process.env): Buffer[] {
  const current = readTombstoneKey(env);
  const previous = readExplicitSecret(env.PRIVACY_TOMBSTONE_KEY_PREVIOUS)?.bytes ?? null;
  const keys = current === null ? [] : [current];
  if (previous !== null && (current === null || !previous.equals(current))) keys.push(previous);
  // Paket 4.1 (§5): tombstones written with the v1-derived key can never be re-keyed (one-way HMACs).
  if (readExplicitSecret(env.PRIVACY_TOMBSTONE_KEY) === null) {
    const legacy = deriveTombstoneKey(env, legacyKdfLabels.privacyTombstoneV1);
    if (legacy !== null && !keys.some((key) => key.equals(legacy))) keys.push(legacy);
  }
  return keys;
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
