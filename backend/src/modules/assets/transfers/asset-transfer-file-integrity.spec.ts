import { mkdtemp, mkdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { inspectAssetTransferFiles } from './asset-transfer-file-integrity';

const transferRoot = (root: string) => path.join(root, 'assets', 'transfers');

async function makeUploadRoot(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'asset-transfer-integrity-'));
}

describe('inspectAssetTransferFiles', () => {
  let uploadRoot: string;

  beforeEach(async () => {
    uploadRoot = await makeUploadRoot();
  });

  afterEach(async () => {
    await rm(uploadRoot, { recursive: true, force: true });
  });

  it('compares only transfer files with DB references and never deletes anything', async () => {
    const directory = path.join(transferRoot(uploadRoot), 'transfer-1');
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'signed.pdf'), 'signed');
    await writeFile(path.join(directory, 'orphan.pdf'), 'orphan');
    await mkdir(path.join(uploadRoot, 'ticket-attachments'), { recursive: true });
    await writeFile(path.join(uploadRoot, 'ticket-attachments', 'not-a-transfer.pdf'), 'outside');

    const result = await inspectAssetTransferFiles(uploadRoot, [
      'assets/transfers/transfer-1/signed.pdf',
      'assets/transfers/transfer-1/missing.pdf',
    ]);

    expect(result).toEqual({
      scanState: 'complete',
      scannedFiles: 2,
      referencedFiles: 2,
      orphanedFiles: 1,
      missingFiles: 1,
    });
    expect((await stat(path.join(directory, 'signed.pdf'))).isFile()).toBe(true);
  });

  it('returns unknown counts for an absent transfer root instead of claiming zero', async () => {
    const result = await inspectAssetTransferFiles(uploadRoot, []);

    expect(result).toMatchObject({
      scanState: 'limited',
      scannedFiles: null,
      referencedFiles: null,
      orphanedFiles: null,
      missingFiles: null,
    });
  });

  it('does not follow a symlink used as the transfer directory', async () => {
    const outside = path.join(uploadRoot, 'outside');
    await mkdir(outside, { recursive: true });
    await writeFile(path.join(outside, 'private.pdf'), 'outside');
    await mkdir(path.join(uploadRoot, 'assets'), { recursive: true });
    await symlink(outside, transferRoot(uploadRoot), 'dir');

    const result = await inspectAssetTransferFiles(uploadRoot, []);

    expect(result.scanState).toBe('limited');
    expect(result.orphanedFiles).toBeNull();
    await expect(writeFile(path.join(outside, 'private.pdf'), 'still present')).resolves.toBeUndefined();
  });

  it('treats symlink entries and entry-limit exhaustion as incomplete scans', async () => {
    const directory = transferRoot(uploadRoot);
    await mkdir(directory, { recursive: true });
    const outside = path.join(uploadRoot, 'outside.pdf');
    await writeFile(outside, 'outside');
    await symlink(outside, path.join(directory, 'linked.pdf'));

    const symlinkResult = await inspectAssetTransferFiles(uploadRoot, []);
    expect(symlinkResult).toMatchObject({ scanState: 'limited', orphanedFiles: null, missingFiles: null });

    await rm(path.join(directory, 'linked.pdf'));
    await writeFile(path.join(directory, 'one.pdf'), '1');
    await writeFile(path.join(directory, 'two.pdf'), '2');
    const boundedResult = await inspectAssetTransferFiles(uploadRoot, [], { maxEntries: 1 });
    expect(boundedResult).toMatchObject({ scanState: 'limited', scannedFiles: null, orphanedFiles: null });
  });

  it('returns unknown for invalid or out-of-root database references', async () => {
    await mkdir(transferRoot(uploadRoot), { recursive: true });
    await writeFile(path.join(transferRoot(uploadRoot), 'safe.pdf'), 'safe');

    const result = await inspectAssetTransferFiles(uploadRoot, [
      '../outside.pdf',
    ]);

    expect(result).toMatchObject({ scanState: 'limited', orphanedFiles: null, missingFiles: null });
  });
});
