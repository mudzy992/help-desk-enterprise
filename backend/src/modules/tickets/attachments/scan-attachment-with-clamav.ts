import { Socket } from 'node:net';
import { TicketsError } from '../tickets.error';

/**
 * Review 2026-09-25 (N5): optional antivirus scan of uploads through a clamd
 * daemon (INSTREAM protocol). Disabled unless CLAMAV_HOST is set. When enabled
 * it fails CLOSED: an unreachable scanner rejects the upload with 503
 * (ATTACHMENT_SCAN_UNAVAILABLE) unless CLAMAV_FAIL_OPEN=true.
 *
 * Env: CLAMAV_HOST, CLAMAV_PORT (3310), CLAMAV_TIMEOUT_MS (15000),
 * CLAMAV_FAIL_OPEN (false).
 */
export type ClamavConfiguration = {
  readonly host: string;
  readonly port: number;
  readonly timeoutMs: number;
  readonly failOpen: boolean;
};

const chunkSize = 64 * 1024;

export function readClamavConfiguration(
  env: NodeJS.ProcessEnv = process.env,
): ClamavConfiguration | null {
  const host = env.CLAMAV_HOST?.trim() ?? '';
  if (host.length === 0) return null;
  const port = Number.parseInt(env.CLAMAV_PORT ?? '', 10);
  const timeoutMs = Number.parseInt(env.CLAMAV_TIMEOUT_MS ?? '', 10);
  return {
    host,
    port: Number.isFinite(port) && port > 0 ? port : 3310,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 15_000,
    failOpen: env.CLAMAV_FAIL_OPEN?.trim().toLowerCase() === 'true',
  };
}

export type ClamavVerdict = { readonly clean: true } | { readonly clean: false; readonly signature: string };

export function parseClamavReply(reply: string): ClamavVerdict {
  const text = reply.replace(/\0/g, '').trim();
  if (/:\s*OK$/.test(text)) return { clean: true };
  const found = /:\s*(.+)\s+FOUND$/.exec(text);
  if (found !== null) return { clean: false, signature: found[1] };
  throw new Error(`Unexpected clamd reply: ${text.slice(0, 200)}`);
}

export function instreamClamav(
  contents: Buffer,
  configuration: ClamavConfiguration,
  createSocket: () => Socket = () => new Socket(),
): Promise<ClamavVerdict> {
  return new Promise((resolve, reject) => {
    const socket = createSocket();
    const chunks: Buffer[] = [];
    let settled = false;
    const finish = (run: () => void) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      run();
    };
    socket.setTimeout(configuration.timeoutMs, () =>
      finish(() => reject(new Error('clamd timeout'))),
    );
    socket.on('error', (error) => finish(() => reject(error)));
    socket.on('data', (data: Buffer) => chunks.push(data));
    socket.on('end', () =>
      finish(() => {
        try {
          resolve(parseClamavReply(Buffer.concat(chunks).toString('utf8')));
        } catch (error) {
          reject(error);
        }
      }),
    );
    socket.connect(configuration.port, configuration.host, () => {
      socket.write('zINSTREAM\0');
      for (let offset = 0; offset < contents.length; offset += chunkSize) {
        const chunk = contents.subarray(offset, offset + chunkSize);
        const size = Buffer.alloc(4);
        size.writeUInt32BE(chunk.length, 0);
        socket.write(size);
        socket.write(chunk);
      }
      socket.write(Buffer.alloc(4));
    });
  });
}

export async function scanAttachmentWithClamav(
  contents: Buffer,
  configuration: ClamavConfiguration | null = readClamavConfiguration(),
  scan: (contents: Buffer, configuration: ClamavConfiguration) => Promise<ClamavVerdict> = instreamClamav,
): Promise<void> {
  if (configuration === null) return;
  let verdict: ClamavVerdict;
  try {
    verdict = await scan(contents, configuration);
  } catch {
    if (configuration.failOpen) return;
    throw new TicketsError('ATTACHMENT_SCAN_UNAVAILABLE');
  }
  if (!verdict.clean) {
    throw new TicketsError('ATTACHMENT_INFECTED');
  }
}
