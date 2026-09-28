import { randomBytes } from 'node:crypto';
import { formatPinnedSecret, readExplicitSecret } from './read-explicit-secret';
import {
  decryptMfaSecret,
  decryptMfaSecretWithRotation,
  encryptMfaSecret,
} from '../../modules/authentication/security/mfa-secret-cipher';
import { reencryptMfaSecrets, type MfaColumn, type StoredMfaRow } from '../../modules/authentication/security/reencrypt-mfa-secrets';
import {
  createReplyTokenMessageId,
  deriveReplyTokenSecret,
  findReplyToken,
  readReplyTokenSecret,
  readReplyTokenVerificationSecrets,
} from '../../modules/notifications/email/reply-token';
import { computeTombstones, deriveTombstoneKey, readTombstoneKey, readTombstoneMatchKeys } from '../../modules/privacy/anonymization/tombstones';
import { deriveExportMasterKey, readExportMasterKey } from '../../modules/privacy/export/export-cipher';
import { dependentKeys, describeDependentKey } from '../../cli/secrets';

const mfaKey = () => randomBytes(32).toString('base64');

describe('readExplicitSecret', () => {
  it('keeps the historic plain-text format and accepts base64: pins', () => {
    expect(readExplicitSecret('  short ')).toBeNull();
    expect(readExplicitSecret('0123456789abcdef')).toEqual({ bytes: Buffer.from('0123456789abcdef'), pinned: false });
    const bytes = randomBytes(32);
    expect(readExplicitSecret(formatPinnedSecret(bytes))).toEqual({ bytes, pinned: true });
    expect(readExplicitSecret('base64:AAAA')).toBeNull();
    expect(readExplicitSecret(undefined)).toBeNull();
  });
});

describe('pinning derived keys', () => {
  it('a pin reproduces every derived key byte for byte, so MFA_ENCRYPTION_KEY can change afterwards', () => {
    const before = { MFA_ENCRYPTION_KEY: mfaKey() };
    const pinned = {
      MFA_ENCRYPTION_KEY: mfaKey(), // already rotated
      INBOUND_EMAIL_TOKEN_SECRET: formatPinnedSecret(deriveReplyTokenSecret(before)!),
      PRIVACY_TOMBSTONE_KEY: formatPinnedSecret(deriveTombstoneKey(before)!),
      PRIVACY_EXPORT_KEY: formatPinnedSecret(deriveExportMasterKey(before)!),
    };
    expect(readReplyTokenSecret(pinned)!.equals(readReplyTokenSecret(before)!)).toBe(true);
    expect(readTombstoneKey(pinned)!.equals(readTombstoneKey(before)!)).toBe(true);
    expect(readExportMasterKey(pinned)!.equals(readExportMasterKey(before)!)).toBe(true);
    expect(dependentKeys.map((key) => describeDependentKey(key, pinned))).toEqual(['pinned', 'pinned', 'pinned']);
    expect(dependentKeys.map((key) => describeDependentKey(key, before))).toEqual(['derived', 'derived', 'derived']);
    expect(dependentKeys.map((key) => describeDependentKey(key, {}))).toEqual(['missing', 'missing', 'missing']);
  });

  it('plain-text explicit keys behave exactly as before', () => {
    const env = { PRIVACY_EXPORT_KEY: 'export-key-plain-text', INBOUND_EMAIL_TOKEN_SECRET: 'reply-secret-plain-text' };
    expect(readExportMasterKey(env)).toHaveLength(32);
    expect(readReplyTokenSecret(env)!.toString('utf8')).toBe('reply-secret-plain-text');
  });
});

describe('reply token rotation', () => {
  it('accepts the previous secret while INBOUND_EMAIL_TOKEN_SECRET_PREVIOUS is set', () => {
    const old = 'old-reply-secret-0123';
    const messageId = createReplyTokenMessageId({
      secret: Buffer.from(old),
      ticketId: 'ticket0001',
      recipientId: 'recipient01',
      dedupeKey: 'k',
      domain: 'x.ba',
    })!;
    const rotated = { INBOUND_EMAIL_TOKEN_SECRET: 'new-reply-secret-0123' };
    expect(findReplyToken([messageId], readReplyTokenVerificationSecrets(rotated))).toBeNull();
    const grace = { ...rotated, INBOUND_EMAIL_TOKEN_SECRET_PREVIOUS: old };
    expect(readReplyTokenVerificationSecrets(grace)).toHaveLength(2);
    expect(findReplyToken([messageId], readReplyTokenVerificationSecrets(grace))).toEqual({ ticketId: 'ticket0001', recipientId: 'recipient01' });
    expect(findReplyToken([messageId], Buffer.from(old))).not.toBeNull();
    expect(readReplyTokenVerificationSecrets({ INBOUND_EMAIL_TOKEN_SECRET: old, INBOUND_EMAIL_TOKEN_SECRET_PREVIOUS: old })).toHaveLength(1);
  });
});

describe('tombstone rotation', () => {
  it('matches old tombstones through PRIVACY_TOMBSTONE_KEY_PREVIOUS', () => {
    const old = 'old-tombstone-key-01';
    const stored = computeTombstones(Buffer.from(old), { email: 'Bivsi@Firma.ba' });
    const keys = readTombstoneMatchKeys({ PRIVACY_TOMBSTONE_KEY: 'new-tombstone-key-01', PRIVACY_TOMBSTONE_KEY_PREVIOUS: old });
    expect(keys).toHaveLength(2);
    expect(keys.some((key) => computeTombstones(key, { email: 'bivsi@firma.ba' }).some((value) => stored.includes(value)))).toBe(true);
    expect(readTombstoneMatchKeys({ PRIVACY_TOMBSTONE_KEY: 'new-tombstone-key-01' })).toHaveLength(1);
  });
});

describe('MFA key rotation', () => {
  const oldKey = randomBytes(32);
  const newKey = randomBytes(32);

  it('decrypts with the previous key during a rotation and says so', () => {
    const stored = encryptMfaSecret('SECRET', oldKey);
    expect(decryptMfaSecretWithRotation(stored, newKey, oldKey)).toEqual({ plain: 'SECRET', usedPrevious: true });
    expect(decryptMfaSecretWithRotation(encryptMfaSecret('S2', newKey), newKey, oldKey)).toEqual({ plain: 'S2', usedPrevious: false });
    expect(() => decryptMfaSecretWithRotation(stored, newKey, null)).toThrow();
  });

  function memoryStore(rows: StoredMfaRow[], interfere?: (userId: string, column: MfaColumn) => void) {
    const table = new Map(rows.map((row) => [row.userId, { ...row }]));
    return {
      table,
      store: {
        listRows: async (after: string | null, take: number) =>
          [...table.values()].filter((row) => after === null || row.userId > after).sort((a, b) => a.userId.localeCompare(b.userId)).slice(0, take),
        compareAndSet: async (userId: string, column: MfaColumn, expected: string, next: string) => {
          interfere?.(userId, column);
          const row = table.get(userId)!;
          if (row[column] !== expected) return false;
          table.set(userId, { ...row, [column]: next });
          return true;
        },
      },
    };
  }

  it('dry run changes nothing; apply moves active and pending secrets; a second run is a no-op', async () => {
    const { table, store } = memoryStore([
      { userId: 'a', secretEncrypted: encryptMfaSecret('A', oldKey), pendingSecretEncrypted: null },
      { userId: 'b', secretEncrypted: encryptMfaSecret('B', newKey), pendingSecretEncrypted: encryptMfaSecret('Bp', oldKey) },
      { userId: 'c', secretEncrypted: encryptMfaSecret('C', randomBytes(32)), pendingSecretEncrypted: null },
    ]);
    const snapshot = JSON.stringify([...table.values()]);
    const dry = await reencryptMfaSecrets({ store, currentKey: newKey, previousKey: oldKey, apply: false, batchSize: 2 });
    expect(dry).toMatchObject({ scannedRows: 3, alreadyCurrent: 1, reencrypted: 2, unreadable: [{ userId: 'c', column: 'secretEncrypted' }] });
    expect(JSON.stringify([...table.values()])).toBe(snapshot);

    const applied = await reencryptMfaSecrets({ store, currentKey: newKey, previousKey: oldKey, apply: true, batchSize: 2 });
    expect(applied).toMatchObject({ reencrypted: 2, skippedConcurrentChange: 0 });
    expect(decryptMfaSecret(table.get('a')!.secretEncrypted!, newKey)).toBe('A');
    expect(decryptMfaSecret(table.get('b')!.pendingSecretEncrypted!, newKey)).toBe('Bp');
    expect(table.get('c')!.secretEncrypted).toBe(JSON.parse(snapshot)[2].secretEncrypted);

    const again = await reencryptMfaSecrets({ store, currentKey: newKey, previousKey: oldKey, apply: true });
    expect(again).toMatchObject({ alreadyCurrent: 3, reencrypted: 0 });
  });

  it('never overwrites a secret changed concurrently (re-enrollment during the run)', async () => {
    const fresh = encryptMfaSecret('NEW', newKey);
    const harness = memoryStore([{ userId: 'a', secretEncrypted: encryptMfaSecret('A', oldKey), pendingSecretEncrypted: null }], (userId) => {
      harness.table.set(userId, { ...harness.table.get(userId)!, secretEncrypted: fresh });
    });
    const report = await reencryptMfaSecrets({ store: harness.store, currentKey: newKey, previousKey: oldKey, apply: true });
    expect(report).toMatchObject({ reencrypted: 0, skippedConcurrentChange: 1 });
    expect(harness.table.get('a')!.secretEncrypted).toBe(fresh);
  });
});
