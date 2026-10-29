import { TicketsError } from '../tickets.error';

const maximumConcurrentAttachmentIo = 4;
const maximumQueuedAttachmentIo = 32;
const queueTimeoutMs = 30_000;
let active = 0;
const waiting: Array<() => void> = [];

export async function acquireAttachmentIoLease(): Promise<() => void> {
  if (active >= maximumConcurrentAttachmentIo) {
    if (waiting.length >= maximumQueuedAttachmentIo) throw new TicketsError('ATTACHMENTS_STORAGE_UNAVAILABLE');
    await new Promise<void>((resolve, reject) => {
      const release = () => { clearTimeout(timer); resolve(); };
      const timer = setTimeout(() => {
        const index = waiting.indexOf(release);
        if (index >= 0) waiting.splice(index, 1);
        reject(new TicketsError('ATTACHMENTS_STORAGE_UNAVAILABLE'));
      }, queueTimeoutMs);
      timer.unref?.();
      waiting.push(release);
    });
  }
  active += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    active -= 1;
    waiting.shift()?.();
  };
}

export async function withAttachmentIoLimit<T>(operation: () => Promise<T>): Promise<T> {
  const release = await acquireAttachmentIoLease();
  try {
    return await operation();
  } finally {
    release();
  }
}

export function attachmentIoState(): { active: number; queued: number; limit: number } {
  return { active, queued: waiting.length, limit: maximumConcurrentAttachmentIo };
}
