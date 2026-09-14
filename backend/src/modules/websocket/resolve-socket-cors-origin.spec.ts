import { resolveSocketCorsOrigin } from './resolve-socket-cors-origin';

describe('resolveSocketCorsOrigin', () => {
  const originalOrigin = process.env.CORS_ORIGIN;

  afterEach(() => {
    if (originalOrigin === undefined) {
      delete process.env.CORS_ORIGIN;
      return;
    }
    process.env.CORS_ORIGIN = originalOrigin;
  });

  it('returns the configured origin and never falls back to *', () => {
    process.env.CORS_ORIGIN = 'https://desk.ba101.top';
    expect(resolveSocketCorsOrigin()).toBe('https://desk.ba101.top');
    expect(resolveSocketCorsOrigin()).not.toBe('*');
  });

  it('disables CORS reflection when origin is missing', () => {
    delete process.env.CORS_ORIGIN;
    expect(resolveSocketCorsOrigin()).toBe(false);
  });

  it('returns multiple origins from a CSV CORS_ORIGIN value', () => {
    process.env.CORS_ORIGIN =
      'https://desk.ba101.top,chrome-extension://abcdefghijklmnopqrstuvwxyz123456';
    expect(resolveSocketCorsOrigin()).toEqual([
      'https://desk.ba101.top',
      'chrome-extension://abcdefghijklmnopqrstuvwxyz123456',
    ]);
  });
});
