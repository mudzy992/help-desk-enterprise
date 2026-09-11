import type { TicketAttachmentUploadInput } from './attachments/attachments.types';

const pngBase64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

export const pngFixture = Buffer.from(pngBase64, 'base64');

export function attachmentUpload(
  originalName: string,
  buffer: Buffer,
  extras: Partial<TicketAttachmentUploadInput> = {},
): TicketAttachmentUploadInput {
  return {
    originalName,
    declaredMimeType: extras.declaredMimeType ?? 'application/octet-stream',
    size: extras.size ?? buffer.length,
    buffer,
    requestedClassification: extras.requestedClassification,
  };
}

export function storedZip(entries: readonly { name: string; content: string }[]): Buffer {
  return Buffer.concat(
    entries.map((entry) => {
      const name = Buffer.from(entry.name);
      const content = Buffer.from(entry.content);
      const header = Buffer.alloc(30);
      header.writeUInt32LE(0x04034b50, 0);
      header.writeUInt16LE(20, 4);
      header.writeUInt32LE(content.length, 18);
      header.writeUInt32LE(content.length, 22);
      header.writeUInt16LE(name.length, 26);
      return Buffer.concat([header, name, content]);
    }),
  );
}
