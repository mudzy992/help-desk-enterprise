import { mkdir, readdir, rm, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { gzip } from 'node:zlib';
import { resolveUploadRoot } from '../tickets/attachments/resolve-upload-root';

const gzipAsync = promisify(gzip);
const folderName = 'inbound-raw';

/**
 * Paket 2.3 (R14): the original e-mail, gzip-compressed, for later review of
 * a rejected or badly cleaned message. Lives next to ticket attachments
 * (same volume, same backup), one folder per month for cheap retention.
 */
export class InboundRawStore {
  constructor(private readonly root: string = path.join(resolveUploadRoot(), folderName)) {}

  async save(id: string, raw: Buffer, now: Date): Promise<string> {
    if (!/^[a-z0-9]+$/i.test(id)) throw new Error('Invalid inbound id');
    const month = now.toISOString().slice(0, 7);
    const key = `${month}/${id}.eml.gz`;
    await mkdir(path.join(this.root, month), { recursive: true });
    await writeFile(path.join(this.root, key), await gzipAsync(raw), { mode: 0o600 });
    return key;
  }

  async remove(key: string): Promise<void> {
    if (!/^\d{4}-\d{2}\/[a-z0-9]+\.eml\.gz$/i.test(key)) return;
    await unlink(path.join(this.root, key)).catch(() => undefined);
  }

  /** Drops whole month folders older than the retention window. */
  async pruneMonthsBefore(cutoff: Date): Promise<number> {
    const cutoffMonth = cutoff.toISOString().slice(0, 7);
    let removed = 0;
    const entries = await readdir(this.root).catch(() => [] as string[]);
    for (const entry of entries) {
      if (!/^\d{4}-\d{2}$/.test(entry) || entry >= cutoffMonth) continue;
      const folder = path.join(this.root, entry);
      if ((await stat(folder).catch(() => null))?.isDirectory() !== true) continue;
      await rm(folder, { recursive: true, force: true });
      removed += 1;
    }
    return removed;
  }
}
