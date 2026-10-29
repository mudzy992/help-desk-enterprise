import { createReadStream } from 'node:fs';
import { once } from 'node:events';
import { Socket } from 'node:net';
import { TicketsError } from '../tickets.error';
import { parseClamavReply, readClamavConfiguration, type ClamavConfiguration, type ClamavVerdict } from './scan-attachment-with-clamav';

export async function scanAttachmentPathWithClamav(
  sourcePath: string,
  configuration: ClamavConfiguration | null = readClamavConfiguration(),
): Promise<void> {
  if (configuration === null) return;
  try {
    const verdict = await streamPathToClamav(sourcePath, configuration);
    if (!verdict.clean) throw new TicketsError('ATTACHMENT_INFECTED');
  } catch (error) {
    if (error instanceof TicketsError) throw error;
    if (!configuration.failOpen) throw new TicketsError('ATTACHMENT_SCAN_UNAVAILABLE');
  }
}

async function streamPathToClamav(sourcePath: string, configuration: ClamavConfiguration): Promise<ClamavVerdict> {
  const socket = new Socket();
  const replies: Buffer[] = [];
  socket.setTimeout(configuration.timeoutMs, () => socket.destroy(new Error('clamd timeout')));
  socket.on('data', (chunk: Buffer) => replies.push(chunk));
  await new Promise<void>((resolve, reject) => {
    socket.once('error', reject);
    socket.connect(configuration.port, configuration.host, resolve);
  });
  try {
    if (!socket.write('zINSTREAM\0')) await once(socket, 'drain');
    for await (const value of createReadStream(sourcePath, { highWaterMark: 64 * 1024 })) {
      const chunk = value as Buffer;
      const size = Buffer.allocUnsafe(4);
      size.writeUInt32BE(chunk.length, 0);
      if (!socket.write(size)) await once(socket, 'drain');
      if (!socket.write(chunk)) await once(socket, 'drain');
    }
    socket.end(Buffer.alloc(4));
    await once(socket, 'end');
    return parseClamavReply(Buffer.concat(replies).toString('utf8'));
  } finally {
    socket.destroy();
  }
}
