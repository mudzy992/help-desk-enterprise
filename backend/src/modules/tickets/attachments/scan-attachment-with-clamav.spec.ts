import { createServer, type AddressInfo, type Server } from 'node:net';
import {
  instreamClamav,
  parseClamavReply,
  readClamavConfiguration,
  scanAttachmentWithClamav,
} from './scan-attachment-with-clamav';

function fakeClamd(reply: (payload: Buffer) => string): Promise<Server> {
  return new Promise((resolve) => {
    const server = createServer((socket) => {
      const received: Buffer[] = [];
      socket.on('data', (data) => {
        received.push(data);
        const all = Buffer.concat(received);
        if (all.length >= 14 && all.subarray(all.length - 4).readUInt32BE(0) === 0) {
          socket.end(`${reply(all)}\0`);
        }
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

describe('ClamAV scan (review N5)', () => {
  it('is disabled without CLAMAV_HOST', async () => {
    expect(readClamavConfiguration({})).toBeNull();
    await expect(scanAttachmentWithClamav(Buffer.from('x'), null)).resolves.toBeUndefined();
  });

  it('parses clamd replies', () => {
    expect(parseClamavReply('stream: OK\0')).toEqual({ clean: true });
    expect(parseClamavReply('stream: Eicar-Signature FOUND\0')).toEqual({ clean: false, signature: 'Eicar-Signature' });
    expect(() => parseClamavReply('INSTREAM size limit exceeded. ERROR')).toThrow();
  });

  it('streams the file with INSTREAM framing and reports infections', async () => {
    const server = await fakeClamd((payload) =>
      payload.includes(Buffer.from('EICAR')) ? 'stream: Eicar-Signature FOUND' : 'stream: OK',
    );
    const { port } = server.address() as AddressInfo;
    const configuration = { host: '127.0.0.1', port, timeoutMs: 2000, failOpen: false };
    try {
      await expect(instreamClamav(Buffer.from('hello'), configuration)).resolves.toEqual({ clean: true });
      await expect(scanAttachmentWithClamav(Buffer.from('xx EICAR xx'), configuration)).rejects.toMatchObject({
        code: 'ATTACHMENT_INFECTED',
      });
    } finally {
      server.close();
    }
  });

  it('fails closed when the scanner is unreachable, unless fail-open', async () => {
    const down = async () => {
      throw new Error('ECONNREFUSED');
    };
    const configuration = { host: 'clamav', port: 3310, timeoutMs: 10, failOpen: false };
    await expect(scanAttachmentWithClamav(Buffer.from('x'), configuration, down)).rejects.toMatchObject({
      code: 'ATTACHMENT_SCAN_UNAVAILABLE',
    });
    await expect(
      scanAttachmentWithClamav(Buffer.from('x'), { ...configuration, failOpen: true }, down),
    ).resolves.toBeUndefined();
  });
});
