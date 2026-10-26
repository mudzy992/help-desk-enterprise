import { attachmentIoState, withAttachmentIoLimit } from './attachment-io-limiter';

describe('attachment I/O limiter', () => {
  it('bounds parallel streaming work and drains queued operations', async () => {
    let observed = 0;
    const jobs = Array.from({ length: 20 }, () => withAttachmentIoLimit(async () => {
      observed = Math.max(observed, attachmentIoState().active);
      await new Promise((resolve) => setTimeout(resolve, 5));
    }));
    await Promise.all(jobs);
    expect(observed).toBe(4);
    expect(attachmentIoState()).toEqual({ active: 0, queued: 0, limit: 4 });
  });
});
