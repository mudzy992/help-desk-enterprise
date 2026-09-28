import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createExportDecryptStream, createExportEncryptStream, readExportMasterKey } from './export-cipher';

async function collect(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const parts: Buffer[] = [];
  for await (const part of stream) parts.push(part as Buffer);
  return Buffer.concat(parts);
}

async function run(input: Buffer, transform: NodeJS.ReadWriteStream, chunk = 100_000): Promise<Buffer> {
  const pieces: Buffer[] = [];
  for (let i = 0; i < input.length; i += chunk) pieces.push(input.subarray(i, i + chunk));
  const out: Buffer[] = [];
  await pipeline(Readable.from(pieces), transform, async (source: AsyncIterable<string | Buffer>) => {
    for await (const part of source) out.push(Buffer.from(part));
  });
  return Buffer.concat(out);
}

const master = randomBytes(32);

describe('export cipher (paket 2.6 §5.1)', () => {
  it.each([0, 10, 1024 * 1024, 1024 * 1024 + 1, 3 * 1024 * 1024 + 17])('round-trips %d bytes', async (size) => {
    const plain = randomBytes(size);
    const sealed = await run(plain, createExportEncryptStream(master));
    if (size >= 64) expect(sealed.includes(plain.subarray(0, 64))).toBe(false);
    expect((await run(sealed, createExportDecryptStream(master), 7_777)).equals(plain)).toBe(true);
  });

  it('uses a fresh key per export', async () => {
    const plain = Buffer.from('isti sadržaj');
    const a = await run(plain, createExportEncryptStream(master));
    const b = await run(plain, createExportEncryptStream(master));
    expect(a.equals(b)).toBe(false);
  });

  it('detects tampering, truncation and a wrong master key', async () => {
    const plain = randomBytes(2 * 1024 * 1024 + 5);
    const sealed = await run(plain, createExportEncryptStream(master));
    const tampered = Buffer.from(sealed);
    tampered[200] ^= 1;
    await expect(run(tampered, createExportDecryptStream(master))).rejects.toThrow();
    // Drop the final segment: remaining segments are not marked final.
    const twoSegments = 72 + 2 * (4 + 1024 * 1024 + 16);
    await expect(run(sealed.subarray(0, twoSegments), createExportDecryptStream(master))).rejects.toThrow();
    await expect(run(sealed.subarray(0, sealed.length - 3), createExportDecryptStream(master))).rejects.toThrow();
    await expect(run(sealed, createExportDecryptStream(randomBytes(32)))).rejects.toThrow();
  });

  it('derives a master key from MFA_ENCRYPTION_KEY or uses PRIVACY_EXPORT_KEY', () => {
    const mfa = randomBytes(32).toString('base64');
    const derived = readExportMasterKey({ MFA_ENCRYPTION_KEY: mfa } as never)!;
    expect(derived).toHaveLength(32);
    expect(derived.equals(Buffer.from(mfa, 'base64'))).toBe(false);
    expect(readExportMasterKey({ PRIVACY_EXPORT_KEY: 'x'.repeat(20) } as never)).toHaveLength(32);
    expect(readExportMasterKey({} as never)).toBeNull();
  });

  it('collect helper works with the stream API', async () => {
    expect(await collect(Readable.from([Buffer.from('a')]))).toEqual(Buffer.from('a'));
  });
});
