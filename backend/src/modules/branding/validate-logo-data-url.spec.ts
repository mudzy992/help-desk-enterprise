import { LogoValidationError, validateLogoDataUrl } from './validate-logo-data-url';

function png(width: number, height: number, padding = 0): Buffer {
  const header = Buffer.alloc(33 + padding);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header, 0);
  header.writeUInt32BE(13, 8);
  header.write('IHDR', 12, 'ascii');
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  return header;
}

function jpeg(width: number, height: number): Buffer {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x0b, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x01, 0x01, 0x11, 0x00]);
}

function webpVp8x(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(30);
  buffer.write('RIFF', 0, 'ascii');
  buffer.write('WEBP', 8, 'ascii');
  buffer.write('VP8X', 12, 'ascii');
  buffer.writeUIntLE(width - 1, 24, 3);
  buffer.writeUIntLE(height - 1, 27, 3);
  return buffer;
}

const url = (type: string, buffer: Buffer) => `data:${type};base64,${buffer.toString('base64')}`;

describe('validateLogoDataUrl', () => {
  it('accepts PNG, JPEG and WebP and reads their dimensions', () => {
    expect(validateLogoDataUrl(url('image/png', png(256, 128)))).toMatchObject({ mimeType: 'image/png', width: 256, height: 128 });
    expect(validateLogoDataUrl(url('image/jpeg', jpeg(300, 200)))).toMatchObject({ mimeType: 'image/jpeg', width: 300, height: 200 });
    expect(validateLogoDataUrl(url('image/webp', webpVp8x(64, 32)))).toMatchObject({ mimeType: 'image/webp', width: 64, height: 32 });
  });

  it('rejects SVG and other types, and malformed data URLs', () => {
    expect(() => validateLogoDataUrl(url('image/svg+xml', Buffer.from('<svg/>')))).toThrow(LogoValidationError);
    expect(() => validateLogoDataUrl('https://example.com/logo.png')).toThrow(LogoValidationError);
    expect(() => validateLogoDataUrl('data:image/png;base64,')).toThrow(LogoValidationError);
  });

  it('rejects content that does not match the declared type', () => {
    expect(() => validateLogoDataUrl(url('image/png', jpeg(10, 10)))).toThrow('does not match');
    expect(() => validateLogoDataUrl(url('image/png', Buffer.from('<script>alert(1)</script>')))).toThrow('not a valid');
  });

  it('enforces the 200 KB and 1024 px limits', () => {
    expect(() => validateLogoDataUrl(url('image/png', png(10, 10, 205 * 1024)))).toThrow('200 KB');
    expect(() => validateLogoDataUrl(url('image/png', png(1025, 10)))).toThrow('1024');
    expect(() => validateLogoDataUrl(url('image/png', png(0, 10)))).toThrow('invalid');
  });
});
