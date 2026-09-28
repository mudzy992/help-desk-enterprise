import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveUploadRoot } from '../../tickets/attachments/resolve-upload-root';

export const PRIVACY_ERASURE_LEDGER = Symbol('PRIVACY_ERASURE_LEDGER');

/**
 * Paket 2.6 (§12): append-only ledger of completed anonymizations, kept
 * outside the database (uploads volume, `privacy-ledger/erasures.jsonl`).
 * After a database restore, `privacy-replay` re-applies every entry whose user
 * is not anonymized in the restored data. Entries hold ids, the pseudonym and
 * tombstone HMACs only — no name or e-mail.
 */
export type ErasureLedgerEntry = {
  readonly v: 1;
  readonly erasureId: string;
  readonly userId: string;
  readonly pseudonym: string;
  readonly tombstones: readonly string[];
  readonly deleteOwnAttachments: boolean;
  readonly requestedByUserId: string | null;
  readonly completedAt: string;
};

export class ErasureLedger {
  constructor(private readonly file: string = path.join(resolveUploadRoot(), 'privacy-ledger', 'erasures.jsonl')) {}

  get location(): string {
    return this.file;
  }

  async append(entry: ErasureLedgerEntry): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
    await appendFile(this.file, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
  }

  /** Valid entries in order; broken lines (e.g. a torn last write) are reported, not fatal. */
  async read(): Promise<{ readonly entries: ErasureLedgerEntry[]; readonly invalidLines: number }> {
    const raw = await readFile(this.file, 'utf8').catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return '';
      throw error;
    });
    const entries: ErasureLedgerEntry[] = [];
    let invalidLines = 0;
    for (const line of raw.split('\n')) {
      if (line.trim().length === 0) continue;
      try {
        const value = JSON.parse(line) as Partial<ErasureLedgerEntry>;
        if (value.v === 1 && typeof value.erasureId === 'string' && typeof value.userId === 'string' && typeof value.pseudonym === 'string') {
          entries.push({
            v: 1,
            erasureId: value.erasureId,
            userId: value.userId,
            pseudonym: value.pseudonym,
            tombstones: Array.isArray(value.tombstones) ? value.tombstones.filter((item) => typeof item === 'string') : [],
            deleteOwnAttachments: value.deleteOwnAttachments === true,
            requestedByUserId: typeof value.requestedByUserId === 'string' ? value.requestedByUserId : null,
            completedAt: typeof value.completedAt === 'string' ? value.completedAt : '',
          });
        } else {
          invalidLines += 1;
        }
      } catch {
        invalidLines += 1;
      }
    }
    return { entries, invalidLines };
  }
}
