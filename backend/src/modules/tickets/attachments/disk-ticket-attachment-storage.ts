import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { TicketsError } from '../tickets.error';
import type { TicketAttachmentStorage } from './attachments.types';
import { resolveContainedStoragePath } from './resolve-upload-root';

const safeSegment = /^[A-Za-z0-9_-]+$/;

export class DiskTicketAttachmentStorage implements TicketAttachmentStorage {
  constructor(private readonly uploadRoot: string) {}

  async write(input: {
    readonly ticketId: string;
    readonly extension: string;
    readonly contents: Buffer;
    readonly idempotencyKey?: string;
    readonly payloadHash?: string;
  }): Promise<string> {
    const storagePath = this.storagePath(input);
    const absolutePath = resolveContainedStoragePath(this.uploadRoot, storagePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    if (input.idempotencyKey === undefined) {
      await writeFile(absolutePath, input.contents);
      return storagePath;
    }
    const stagingPath = `${absolutePath}.${randomUUID()}.tmp`;
    try {
      await writeFile(stagingPath, input.contents, { flag: 'wx' });
      await rename(stagingPath, absolutePath);
      return storagePath;
    } catch (error) {
      await unlink(stagingPath).catch(() => undefined);
      throw error;
    }
  }

  async writeFromPath(input: {
    readonly ticketId: string;
    readonly extension: string;
    readonly sourcePath: string;
    readonly idempotencyKey?: string;
    readonly payloadHash?: string;
  }): Promise<string> {
    const storagePath = this.storagePath(input);
    const absolutePath = resolveContainedStoragePath(this.uploadRoot, storagePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    const stagingPath = input.idempotencyKey === undefined ? absolutePath : `${absolutePath}.${randomUUID()}.tmp`;
    try {
      await pipeline(
        createReadStream(input.sourcePath),
        createWriteStream(stagingPath, { flags: 'wx' }),
      );
      if (stagingPath !== absolutePath) await rename(stagingPath, absolutePath);
      return storagePath;
    } catch {
      await unlink(stagingPath).catch(() => undefined);
      throw new TicketsError('ATTACHMENTS_STORAGE_UNAVAILABLE');
    }
  }

  private storagePath(input: {
    readonly ticketId: string;
    readonly extension: string;
    readonly idempotencyKey?: string;
    readonly payloadHash?: string;
  }): string {
    if (!safeSegment.test(input.ticketId) || !safeSegment.test(input.extension)) {
      throw new TicketsError('ATTACHMENT_FILENAME_INVALID');
    }
    if (input.idempotencyKey === undefined) {
      return path.posix.join('tickets', input.ticketId, `${randomUUID()}.${input.extension}`);
    }
    const payloadHash = input.payloadHash;
    if (payloadHash === undefined || !/^[a-f0-9]{64}$/u.test(payloadHash)) {
      throw new TicketsError('ATTACHMENT_FILENAME_INVALID');
    }
    const digest = createHash('sha256')
      .update(input.idempotencyKey)
      .update('\0')
      .update(payloadHash)
      .digest('hex');
    return path.posix.join('tickets', input.ticketId, `inbound-${digest}.${input.extension}`);
  }

  async copy(input: { readonly sourcePath: string; readonly ticketId: string; readonly extension: string }): Promise<string> {
    if (!safeSegment.test(input.ticketId) || !safeSegment.test(input.extension)) throw new TicketsError('ATTACHMENT_FILENAME_INVALID');
    const target = path.posix.join('tickets', input.ticketId, `${randomUUID()}.${input.extension}`);
    const sourceAbsolute = resolveContainedStoragePath(this.uploadRoot, input.sourcePath);
    const targetAbsolute = resolveContainedStoragePath(this.uploadRoot, target);
    await mkdir(path.dirname(targetAbsolute), { recursive: true });
    try {
      await pipeline(createReadStream(sourceAbsolute), createWriteStream(targetAbsolute, { flags: 'wx' }));
      return target;
    } catch (error) {
      await unlink(targetAbsolute).catch(() => undefined);
      if (isMissingFile(error)) throw new TicketsError('ATTACHMENT_NOT_FOUND');
      throw new TicketsError('ATTACHMENTS_STORAGE_UNAVAILABLE');
    }
  }

  async openReadStream(storagePath: string) {
    const absolutePath = resolveContainedStoragePath(this.uploadRoot, storagePath);
    try {
      await import('node:fs/promises').then(({ access }) => access(absolutePath));
      return createReadStream(absolutePath);
    } catch (error) {
      if (isMissingFile(error)) throw new TicketsError('ATTACHMENT_NOT_FOUND');
      throw new TicketsError('ATTACHMENTS_STORAGE_UNAVAILABLE');
    }
  }

  async read(storagePath: string): Promise<Buffer> {
    try {
      return await readFile(
        resolveContainedStoragePath(this.uploadRoot, storagePath),
      );
    } catch (error) {
      if (isMissingFile(error)) {
        throw new TicketsError('ATTACHMENT_NOT_FOUND');
      }
      throw new TicketsError('ATTACHMENTS_STORAGE_UNAVAILABLE');
    }
  }

  async remove(storagePath: string): Promise<void> {
    try {
      await unlink(resolveContainedStoragePath(this.uploadRoot, storagePath));
    } catch (error) {
      if (isMissingFile(error)) {
        return;
      }
      throw new TicketsError('ATTACHMENTS_STORAGE_UNAVAILABLE');
    }
  }
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}
