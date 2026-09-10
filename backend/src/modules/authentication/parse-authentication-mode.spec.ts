import { parseAuthenticationMode } from './parse-authentication-mode';

describe('parseAuthenticationMode', () => {
  it('accepts the supported settings values', () => {
    expect(parseAuthenticationMode('local')).toBe('local');
    expect(parseAuthenticationMode('entra_ad')).toBe('entra_ad');
  });

  it('fails closed for unsupported or test modes', () => {
    expect(() => parseAuthenticationMode('test')).toThrow(
      /UNSUPPORTED_AUTHENTICATION_MODE/,
    );
    expect(() => parseAuthenticationMode('ldap')).toThrow(
      /UNSUPPORTED_AUTHENTICATION_MODE/,
    );
    expect(() => parseAuthenticationMode('')).toThrow(
      /UNSUPPORTED_AUTHENTICATION_MODE/,
    );
    expect(() => parseAuthenticationMode(undefined)).toThrow(
      /UNSUPPORTED_AUTHENTICATION_MODE/,
    );
  });
});
