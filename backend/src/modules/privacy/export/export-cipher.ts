import { readExplicitSecret } from '../../../common/security/read-explicit-secret';
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto';
import { Transform, type TransformCallback } from 'node:stream';
import { readMfaEncryptionKey } from '../../authentication/security/mfa-secret-cipher';

/*
  Paket 2.6 (§5.1): export packages are stored encrypted, AES-256-GCM with a
  fresh key per export. The per-export key is wrapped with a master key
  (PRIVACY_EXPORT_KEY, else derived from MFA_ENCRYPTION_KEY via HKDF) and kept
  in the file header, so no key material lives in the database.

  Format (all integers big-endian):
    "HDX1" | wrapIv(12) | wrapTag(16) | wrappedKey(32) | baseNonce(8)
    segment*: length u32 | ciphertext | tag(16)
  Segment nonce = baseNonce || counter u32; AAD = "HDX1" || final flag.
  Every segment is authenticated before its plaintext is emitted, and the
  last segment carries final = 1, so truncation and reordering are detected.
*/
const magic = Buffer.from('HDX1', 'ascii');
const segmentSize = 1024 * 1024;
const headerLength = 4 + 12 + 16 + 32 + 8;

export class ExportKeyMissingError extends Error {
  constructor() {
    super('export_key_missing');
  }
}

export function readExportMasterKey(env: NodeJS.ProcessEnv = process.env): Buffer | null {
  const explicit = readExplicitSecret(env.PRIVACY_EXPORT_KEY);
  if (explicit !== null) {
    // Pinned (base64:) keys are used as-is, so a pin reproduces the derived key exactly.
    if (explicit.pinned && explicit.bytes.length === 32) return explicit.bytes;
    return createHash('sha256').update(explicit.bytes).digest();
  }
  return deriveExportMasterKey(env);
}

/** The key derived from MFA_ENCRYPTION_KEY (used when no explicit key is set). */
export function deriveExportMasterKey(env: NodeJS.ProcessEnv = process.env): Buffer | null {
  const mfaKey = readMfaEncryptionKey(env.MFA_ENCRYPTION_KEY);
  if (mfaKey === null) return null;
  return Buffer.from(hkdfSync('sha256', mfaKey, Buffer.alloc(0), 'ephelpdesk:privacy-export:v1', 32));
}

function nonce(base: Buffer, counter: number): Buffer {
  const value = Buffer.alloc(12);
  base.copy(value, 0);
  value.writeUInt32BE(counter, 8);
  return value;
}

function aad(final: boolean): Buffer {
  return Buffer.concat([magic, Buffer.from([final ? 1 : 0])]);
}

export function createExportEncryptStream(masterKey: Buffer): Transform {
  const key = randomBytes(32);
  const wrapIv = randomBytes(12);
  const wrap = createCipheriv('aes-256-gcm', masterKey, wrapIv);
  wrap.setAAD(magic);
  const wrappedKey = Buffer.concat([wrap.update(key), wrap.final()]);
  const baseNonce = randomBytes(8);
  let counter = 0;
  let pending: Buffer[] = [];
  let pendingLength = 0;
  let headerWritten = false;

  const seal = (plain: Buffer, final: boolean): Buffer => {
    if (counter === 0xffffffff) throw new Error('export_too_large');
    const cipher = createCipheriv('aes-256-gcm', key, nonce(baseNonce, counter));
    counter += 1;
    cipher.setAAD(aad(final));
    const body = Buffer.concat([cipher.update(plain), cipher.final()]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(body.length, 0);
    return Buffer.concat([length, body, cipher.getAuthTag()]);
  };
  const header = () => {
    if (headerWritten) return [];
    headerWritten = true;
    return [Buffer.concat([magic, wrapIv, wrap.getAuthTag(), wrappedKey, baseNonce])];
  };

  return new Transform({
    transform(chunk: Buffer, _encoding, callback: TransformCallback) {
      try {
        for (const part of header()) this.push(part);
        pending.push(chunk);
        pendingLength += chunk.length;
        // Keep at least one byte back so the final segment is never empty-by-accident.
        while (pendingLength > segmentSize) {
          const all = Buffer.concat(pending);
          this.push(seal(all.subarray(0, segmentSize), false));
          const rest = all.subarray(segmentSize);
          pending = [rest];
          pendingLength = rest.length;
        }
        callback();
      } catch (error) {
        callback(error as Error);
      }
    },
    flush(callback: TransformCallback) {
      try {
        for (const part of header()) this.push(part);
        this.push(seal(Buffer.concat(pending), true));
        callback();
      } catch (error) {
        callback(error as Error);
      }
    },
  });
}

export function createExportDecryptStream(masterKey: Buffer): Transform {
  let buffer = Buffer.alloc(0);
  let key: Buffer | null = null;
  let baseNonce: Buffer | null = null;
  let counter = 0;
  let finished = false;

  const open = (body: Buffer, tag: Buffer, final: boolean): Buffer => {
    const decipher = createDecipheriv('aes-256-gcm', key!, nonce(baseNonce!, counter));
    decipher.setAAD(aad(final));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]);
  };

  return new Transform({
    transform(chunk: Buffer, _encoding, callback: TransformCallback) {
      try {
        buffer = Buffer.concat([buffer, chunk]);
        if (key === null) {
          if (buffer.length < headerLength) return callback();
          if (!buffer.subarray(0, 4).equals(magic)) throw new Error('export_format_invalid');
          const unwrap = createDecipheriv('aes-256-gcm', masterKey, buffer.subarray(4, 16));
          unwrap.setAAD(magic);
          unwrap.setAuthTag(buffer.subarray(16, 32));
          key = Buffer.concat([unwrap.update(buffer.subarray(32, 64)), unwrap.final()]);
          baseNonce = Buffer.from(buffer.subarray(64, 72));
          buffer = buffer.subarray(headerLength);
        }
        // A segment is decided "final" only when no more data follows it, so
        // keep the last complete segment until flush (or until more data arrives).
        for (;;) {
          if (finished && buffer.length > 0) throw new Error('export_trailing_data');
          if (buffer.length < 4) break;
          const length = buffer.readUInt32BE(0);
          const total = 4 + length + 16;
          if (buffer.length <= total) break;
          this.push(open(buffer.subarray(4, 4 + length), buffer.subarray(4 + length, total), false));
          counter += 1;
          buffer = buffer.subarray(total);
        }
        callback();
      } catch (error) {
        callback(error as Error);
      }
    },
    flush(callback: TransformCallback) {
      try {
        if (key === null || buffer.length < 4) throw new Error('export_truncated');
        const length = buffer.readUInt32BE(0);
        if (buffer.length !== 4 + length + 16) throw new Error('export_truncated');
        this.push(open(buffer.subarray(4, 4 + length), buffer.subarray(4 + length), true));
        finished = true;
        callback();
      } catch (error) {
        callback(error as Error);
      }
    },
  });
}
