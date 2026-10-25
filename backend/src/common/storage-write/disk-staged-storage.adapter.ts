import { mkdir, open, rename, rm, stat } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import type { StagedStorageAdapter } from './storage-write.types';

export class DiskStagedStorageAdapter implements StagedStorageAdapter {
  constructor(private readonly root: string) {}

  async stage(stagingKey: string, contents: Buffer): Promise<void> {
    const target = contained(this.root, stagingKey);
    await mkdir(dirname(target), { recursive: true });
    const file = await open(target, 'wx', 0o600);
    try { await file.writeFile(contents); await file.sync(); }
    finally { await file.close(); }
  }

  async promote(stagingKey: string, finalKey: string): Promise<void> {
    const staging = contained(this.root, stagingKey);
    const final = contained(this.root, finalKey);
    await mkdir(dirname(final), { recursive: true });
    try { await rename(staging, final); }
    catch (error) {
      if (await exists(final) && !(await exists(staging))) return;
      throw error;
    }
  }

  async remove(key: string): Promise<void> {
    await rm(contained(this.root, key), { force: true });
  }
}

function contained(root: string, key: string): string {
  const absoluteRoot = resolve(root);
  const target = resolve(absoluteRoot, key);
  if (target !== absoluteRoot && !target.startsWith(`${absoluteRoot}${sep}`)) throw new Error('STORAGE_PATH_OUTSIDE_ROOT');
  return target;
}

async function exists(path: string): Promise<boolean> {
  try { await stat(path); return true; } catch { return false; }
}
