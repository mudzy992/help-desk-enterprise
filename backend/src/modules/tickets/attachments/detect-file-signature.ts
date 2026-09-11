import {
  ticketAttachmentExtensionByMime,
  ticketAttachmentMimeTypes,
} from './attachments.constants';

export type DetectedFileSignature = {
  readonly mimeType: string;
  readonly extensions: readonly string[];
};

const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const jpegMagic = Buffer.from([0xff, 0xd8, 0xff]);
const pdfMagic = Buffer.from('%PDF');
const zipMagic = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const executableMagic = Buffer.from([0x4d, 0x5a]);

export function detectFileSignature(
  contents: Buffer,
): DetectedFileSignature | null {
  if (startsWith(contents, executableMagic)) {
    return null;
  }
  if (startsWith(contents, pngMagic)) {
    return signature(ticketAttachmentMimeTypes.png);
  }
  if (startsWith(contents, jpegMagic)) {
    return signature(ticketAttachmentMimeTypes.jpeg);
  }
  if (startsWith(contents, pdfMagic)) {
    return signature(ticketAttachmentMimeTypes.pdf);
  }
  if (startsWith(contents, zipMagic)) {
    return detectOfficeOpenXml(contents);
  }
  return null;
}

function detectOfficeOpenXml(contents: Buffer): DetectedFileSignature | null {
  const names = readZipEntryNames(contents);
  if (names.some((name) => name.startsWith('word/'))) {
    return signature(ticketAttachmentMimeTypes.docx);
  }
  if (names.some((name) => name.startsWith('xl/'))) {
    return signature(ticketAttachmentMimeTypes.xlsx);
  }
  return null;
}

function readZipEntryNames(contents: Buffer): readonly string[] {
  const names: string[] = [];
  let offset = 0;
  while (offset + 30 <= contents.length) {
    if (contents.readUInt32LE(offset) !== 0x04034b50) {
      break;
    }
    const flags = contents.readUInt16LE(offset + 6);
    const compressedSize = contents.readUInt32LE(offset + 18);
    const nameLength = contents.readUInt16LE(offset + 26);
    const extraLength = contents.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const nameEnd = nameStart + nameLength;
    if (nameEnd > contents.length) {
      break;
    }
    names.push(contents.subarray(nameStart, nameEnd).toString('utf8'));
    offset = nameEnd + extraLength;
    if ((flags & 0x08) === 0) {
      offset += compressedSize;
    }
  }
  return names;
}

function startsWith(contents: Buffer, magic: Buffer): boolean {
  return (
    contents.length >= magic.length && contents.subarray(0, magic.length).equals(magic)
  );
}

function signature(mimeType: string): DetectedFileSignature {
  return {
    mimeType,
    extensions: ticketAttachmentExtensionByMime[mimeType] ?? [],
  };
}
