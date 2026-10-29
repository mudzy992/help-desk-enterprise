import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
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
  }): Promise<string> {
    if (!safeSegment.test(input.ticketId) || !safeSegment.test(input.extension)) {
      throw new TicketsError('ATTACHMENT_FILENAME_INVALID');
    }
    const storagePath = path.posix.join(
      'tickets',
      input.ticketId,
      `${randomUUID()}.${input.extension}`,
    );
    const absolutePath = resolveContainedStoragePath(this.uploadRoot, storagePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, input.contents);
    return storagePath;
  }

  async writeFromPath(input: {
    readonly ticketId: string;
    readonly extension: string;
    readonly sourcePath: string;
  }): Promise<string> {
    if (!safeSegment.test(input.ticketId) || !safeSegment.test(input.extension)) {
      throw new TicketsError('ATTACHMENT_FILENAME_INVALID');
    }
    const storagePath = path.posix.join('tickets', input.ticketId, `${randomUUID()}.${input.extension}`);
    const absolutePath = resolveContainedStoragePath(this.uploadRoot, storagePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    try {
      await pipeline(createReadStream(input.sourcePath), createWriteStream(absolutePath, { flags: 'wx' }));
      return storagePath;
    } catch {
      await unlink(absolutePath).catch(() => undefined);
      throw new TicketsError('ATTACHMENTS_STORAGE_UNAVAILABLE');
    }
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
