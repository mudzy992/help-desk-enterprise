import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { InboundRawStore } from './inbound-raw-store';

describe('InboundRawStore.remove', () => {
  let root: string;
  beforeEach(async () => { root = await mkdtemp(path.join(tmpdir(), 'inbound-raw-test-')); });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  it('deletes a file and treats an already missing file as success', async () => {
    const store = new InboundRawStore(root);
    const key = await store.save('abc', Buffer.from('test'), new Date('2026-01-02T00:00:00Z'));
    await expect(store.remove(key)).resolves.toBeUndefined();
    await expect(store.remove(key)).resolves.toBeUndefined();
  });

  it('rejects invalid keys and real unlink errors', async () => {
    const store = new InboundRawStore(root);
    await expect(store.remove('../secret')).rejects.toThrow('Invalid inbound raw storage key');
    await mkdir(path.join(root, '2026-01', 'abc.eml.gz'), { recursive: true });
    await expect(store.remove('2026-01/abc.eml.gz')).rejects.toThrow();
  });
});
