import { decryptMfaSecretWithRotation, encryptMfaSecret } from './mfa-secret-cipher';

/*
  MFA_ENCRYPTION_KEY rotation, step 3 (ops/runbook/rotacija-tajni.md):
  moves every stored TOTP secret (active and pending enrollment) from
  MFA_ENCRYPTION_KEY_PREVIOUS to the current MFA_ENCRYPTION_KEY.

  - Idempotent: rows already readable with the current key are left alone.
  - Each row is written with a compare-and-set on the old ciphertext, so an
    enrollment or reset that happens concurrently is never overwritten.
  - Every new ciphertext is decrypted again before it is written.
  - Rows readable with neither key are reported (the user needs an MFA reset);
    they are never modified.
*/
export type StoredMfaRow = {
  readonly userId: string;
  readonly secretEncrypted: string | null;
  readonly pendingSecretEncrypted: string | null;
};

export type MfaColumn = 'secretEncrypted' | 'pendingSecretEncrypted';

export type MfaReencryptStore = {
  listRows(afterUserId: string | null, take: number): Promise<StoredMfaRow[]>;
  /** Writes `next` only if the column still holds `expected`; returns false otherwise. */
  compareAndSet(userId: string, column: MfaColumn, expected: string, next: string): Promise<boolean>;
};

export type MfaReencryptReport = {
  readonly scannedRows: number;
  readonly alreadyCurrent: number;
  readonly reencrypted: number;
  readonly skippedConcurrentChange: number;
  readonly unreadable: ReadonlyArray<{ readonly userId: string; readonly column: MfaColumn }>;
};

export async function reencryptMfaSecrets(input: {
  readonly store: MfaReencryptStore;
  readonly currentKey: Buffer;
  readonly previousKey: Buffer | null;
  readonly apply: boolean;
  readonly batchSize?: number;
}): Promise<MfaReencryptReport> {
  const batchSize = input.batchSize ?? 200;
  let cursor: string | null = null;
  let scannedRows = 0;
  let alreadyCurrent = 0;
  let reencrypted = 0;
  let skippedConcurrentChange = 0;
  const unreadable: Array<{ userId: string; column: MfaColumn }> = [];

  for (;;) {
    const rows = await input.store.listRows(cursor, batchSize);
    if (rows.length === 0) break;
    for (const row of rows) {
      scannedRows += 1;
      for (const column of ['secretEncrypted', 'pendingSecretEncrypted'] as const) {
        const stored = row[column];
        if (stored === null) continue;
        let decrypted: { plain: string; usedPrevious: boolean };
        try {
          decrypted = decryptMfaSecretWithRotation(stored, input.currentKey, input.previousKey);
        } catch {
          unreadable.push({ userId: row.userId, column });
          continue;
        }
        if (!decrypted.usedPrevious) {
          alreadyCurrent += 1;
          continue;
        }
        if (!input.apply) {
          reencrypted += 1;
          continue;
        }
        const next = encryptMfaSecret(decrypted.plain, input.currentKey);
        // Self-check before writing: never persist a ciphertext we cannot read back.
        if (decryptMfaSecretWithRotation(next, input.currentKey, null).plain !== decrypted.plain) {
          throw new Error(`re-encryption self-check failed for user ${row.userId}`);
        }
        if (await input.store.compareAndSet(row.userId, column, stored, next)) reencrypted += 1;
        else skippedConcurrentChange += 1;
      }
    }
    cursor = rows[rows.length - 1]!.userId;
    if (rows.length < batchSize) break;
  }
  return { scannedRows, alreadyCurrent, reencrypted, skippedConcurrentChange, unreadable };
}
