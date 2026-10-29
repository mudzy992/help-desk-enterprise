import { mkdtemp, open, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DiskTicketAttachmentStorage } from './disk-ticket-attachment-storage';

 describe('DiskTicketAttachmentStorage streaming', () => {
  it('copies and reads a large attachment through bounded stream chunks', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'attachment-stream-'));
    const source = path.join(root, 'source.bin');
    const handle = await open(source, 'w');
    await handle.truncate(32 * 1024 * 1024);
    await handle.close();
    try {
      const storage = new DiskTicketAttachmentStorage(path.join(root, 'uploads'));
      const key = await storage.writeFromPath({ ticketId: 'ticket_1', extension: 'bin', sourcePath: source });
      const stream = await storage.openReadStream(key);
      let total = 0;
      let largestChunk = 0;
      for await (const value of stream) {
        const chunk = value as Buffer;
        total += chunk.length;
        largestChunk = Math.max(largestChunk, chunk.length);
      }
      expect(total).toBe(32 * 1024 * 1024);
      expect(largestChunk).toBeLessThanOrEqual(64 * 1024);
      expect((await stat(path.join(root, 'uploads', key))).size).toBe(total);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
