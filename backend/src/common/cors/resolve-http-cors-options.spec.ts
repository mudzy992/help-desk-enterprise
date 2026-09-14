import { resolveHttpCorsOptions } from './resolve-http-cors-options';

describe('resolveHttpCorsOptions', () => {
  const originalOrigin = process.env.CORS_ORIGIN;

  afterEach(() => {
    if (originalOrigin === undefined) {
      delete process.env.CORS_ORIGIN;
      return;
    }
    process.env.CORS_ORIGIN = originalOrigin;
  });

  it('reads a single origin from CORS_ORIGIN and never uses *', () => {
    process.env.CORS_ORIGIN = 'https://app.example.test';
    const options = resolveHttpCorsOptions();
    expect(options.origin).toBe('https://app.example.test');
    expect(options.origin).not.toBe('*');
    expect(options.credentials).toBe(false);
    expect(options.allowedHeaders).toEqual([
      'Accept',
      'Authorization',
      'Content-Type',
    ]);
  });

  it('disables origin reflection when CORS_ORIGIN is missing', () => {
    delete process.env.CORS_ORIGIN;
    expect(resolveHttpCorsOptions().origin).toBe(false);
  });

  it('parses comma-separated origins and never allows *', () => {
    process.env.CORS_ORIGIN =
      'https://desk.ba101.top, chrome-extension://abcdefghijklmnopqrstuvwxyz123456, *';
    expect(resolveHttpCorsOptions().origin).toEqual([
      'https://desk.ba101.top',
      'chrome-extension://abcdefghijklmnopqrstuvwxyz123456',
    ]);
  });
});
