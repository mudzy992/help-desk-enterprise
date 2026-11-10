import { lstat, opendir, realpath } from 'node:fs/promises';
import path from 'node:path';
import {
  assetTransferFileScanMaxEntries,
  assetTransferFileScanMaxReferences,
  type AssetTransferFileIntegrity,
} from '../asset-operations.types';
import { resolveContainedStoragePath } from '../../tickets/attachments/resolve-upload-root';

const assetTransferStorageRoot = 'assets/transfers';
const maxDirectoryDepth = 4;

/**
 * Read-only comparison of the dedicated transfer-file directory with the
 * database references. It is bounded and never follows symlinks or deletes a
 * file. An incomplete scan reports unknown counts instead of a false zero.
 */
export async function inspectAssetTransferFiles(
  uploadRoot: string,
  referencedStoragePaths: readonly string[],
  limits: {
    readonly maxReferences?: number;
    readonly maxEntries?: number;
  } = {},
): Promise<AssetTransferFileIntegrity> {
  const maxReferences = Math.max(1, limits.maxReferences ?? assetTransferFileScanMaxReferences);
  const maxEntries = Math.max(1, limits.maxEntries ?? assetTransferFileScanMaxEntries);
  if (referencedStoragePaths.length > maxReferences) return limitedScan();

  const references = new Set<string>();
  for (const storagePath of referencedStoragePaths) {
    const key = normalizeReference(uploadRoot, storagePath);
    if (key === null) return limitedScan();
    references.add(key);
  }

  let uploadRootAbsolute: string;
  try {
    // Canonicalize the configured root once, then reject any symlink in the
    // dedicated subdirectory path before opening it.
    uploadRootAbsolute = await realpath(path.resolve(uploadRoot));
  } catch {
    return limitedScan();
  }
  const transferRoot = resolveContainedStoragePath(uploadRootAbsolute, assetTransferStorageRoot);
  if (!(await isSafeTransferDirectory(uploadRootAbsolute))) return limitedScan();
  const foundReferences = new Set<string>();
  let scannedFiles = 0;
  let visitedEntries = 0;
  let limited = false;

  const walk = async (directory: string, relativeDirectory: string, depth: number): Promise<void> => {
    if (depth > maxDirectoryDepth) {
      limited = true;
      return;
    }
    const handle = await opendir(directory);
    for await (const entry of handle) {
      visitedEntries += 1;
      if (visitedEntries > maxEntries) {
        limited = true;
        return;
      }
      const relativePath = `${relativeDirectory}/${entry.name}`;
      const absolutePath = resolveContainedStoragePath(uploadRootAbsolute, relativePath);
      if (entry.isDirectory()) {
        await walk(absolutePath, relativePath, depth + 1);
        if (limited) return;
        continue;
      }
      if (entry.isFile()) {
        scannedFiles += 1;
        if (references.has(relativePath)) foundReferences.add(relativePath);
        continue;
      }
      // Symlinks and special entries are deliberately not followed or silently
      // classified; the operator sees an incomplete integrity scan instead.
      limited = true;
      return;
    }
  };

  await walk(transferRoot, assetTransferStorageRoot, 0);
  if (limited) return limitedScan();

  // `foundReferences` contains only physical files whose paths are referenced;
  // the difference is the number of unreferenced regular files in this root.
  return {
    scanState: 'complete',
    scannedFiles,
    referencedFiles: references.size,
    orphanedFiles: scannedFiles - foundReferences.size,
    missingFiles: references.size - foundReferences.size,
  };
}

function normalizeReference(uploadRoot: string, storagePath: string): string | null {
  if (storagePath.trim() === '') return null;
  try {
    const absolute = resolveContainedStoragePath(uploadRoot, storagePath);
    const relative = path.relative(path.resolve(uploadRoot), absolute).split(path.sep).join('/');
    if (!relative.startsWith(`${assetTransferStorageRoot}/`)) return null;
    return relative;
  } catch {
    return null;
  }
}

function limitedScan(): AssetTransferFileIntegrity {
  return {
    scanState: 'limited',
    scannedFiles: null,
    referencedFiles: null,
    orphanedFiles: null,
    missingFiles: null,
  };
}

async function isSafeTransferDirectory(uploadRoot: string): Promise<boolean> {
  for (const relativePath of ['assets', assetTransferStorageRoot]) {
    const directory = resolveContainedStoragePath(uploadRoot, relativePath);
    try {
      const metadata = await lstat(directory);
      if (metadata.isSymbolicLink() || !metadata.isDirectory()) return false;
    } catch {
      return false;
    }
  }
  return true;
}
