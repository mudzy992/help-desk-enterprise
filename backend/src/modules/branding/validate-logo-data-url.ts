import { brandingLimits, logoMimeTypes, type LogoMimeType } from './branding.constants';

export class LogoValidationError extends Error {}

export type LogoInfo = { readonly mimeType: LogoMimeType; readonly width: number; readonly height: number; readonly bytes: number };

const dataUrlPattern = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/;

/**
 * Paket 4.1 (§3a): the logo is stored as a data URL in a public setting, so it
 * is validated strictly - declared type must match the magic bytes (no SVG:
 * it can carry script), ≤200 KB decoded and ≤1024 px on each side.
 */
export function validateLogoDataUrl(value: string): LogoInfo {
  const match = dataUrlPattern.exec(value);
  if (match === null) throw new LogoValidationError('Logo must be a base64 PNG, JPEG or WebP data URL');
  const declared = match[1] as LogoMimeType;
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length === 0) throw new LogoValidationError('Logo is empty');
  if (buffer.length > brandingLimits.logoMaxBytes) throw new LogoValidationError('Logo must be at most 200 KB');
  const detected = detectImage(buffer);
  if (detected === null) throw new LogoValidationError('Logo content is not a valid PNG, JPEG or WebP image');
  if (detected.mimeType !== declared) throw new LogoValidationError('Logo content does not match its declared type');
  if (detected.width < 1 || detected.height < 1) throw new LogoValidationError('Logo dimensions are invalid');
  if (detected.width > brandingLimits.logoMaxDimension || detected.height > brandingLimits.logoMaxDimension) {
    throw new LogoValidationError('Logo must be at most 1024 × 1024 px');
  }
  return { ...detected, bytes: buffer.length };
}

function detectImage(buffer: Buffer): { mimeType: LogoMimeType; width: number; height: number } | null {
  if (buffer.length >= 24 && buffer.readUInt32BE(0) === 0x89504e47 && buffer.readUInt32BE(4) === 0x0d0a1a0a && buffer.toString('ascii', 12, 16) === 'IHDR') {
    return { mimeType: 'image/png', width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return readJpeg(buffer);
  if (buffer.length >= 30 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return readWebp(buffer);
  return null;
}

function readJpeg(buffer: Buffer): { mimeType: LogoMimeType; width: number; height: number } | null {
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) return null;
    const marker = buffer[offset + 1];
    if (marker === 0xff) { offset += 1; continue; }
    const length = buffer.readUInt16BE(offset + 2);
    const isStartOfFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isStartOfFrame) return { mimeType: 'image/jpeg', height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    if (length < 2) return null;
    offset += 2 + length;
  }
  return null;
}

function readWebp(buffer: Buffer): { mimeType: LogoMimeType; width: number; height: number } | null {
  const chunk = buffer.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return { mimeType: 'image/webp', width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
  if (chunk === 'VP8 ' && buffer[23] === 0x9d && buffer[24] === 0x01 && buffer[25] === 0x2a) {
    return { mimeType: 'image/webp', width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === 'VP8L' && buffer[20] === 0x2f) {
    const bits = buffer.readUInt32LE(21);
    return { mimeType: 'image/webp', width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}

export const supportedLogoMimeTypes = logoMimeTypes;
