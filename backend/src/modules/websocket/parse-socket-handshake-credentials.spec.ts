import { parseSocketHandshakeCredentials } from './parse-socket-handshake-credentials';

describe('parseSocketHandshakeCredentials', () => {
  it('returns credentials when token is a non-empty string', () => {
    const credentials = parseSocketHandshakeCredentials({
      token: 'synthetic-handshake-token-test-only',
    });
    expect(credentials).toEqual({
      token: 'synthetic-handshake-token-test-only',
    });
  });

  it('ignores extra handshake fields and keeps only the token', () => {
    const credentials = parseSocketHandshakeCredentials({
      token: 'synthetic-handshake-token-test-only',
      extensionVersion: '1.0.0',
    });
    expect(credentials).toEqual({
      token: 'synthetic-handshake-token-test-only',
    });
  });

  it('returns null when handshake auth is missing', () => {
    expect(parseSocketHandshakeCredentials(undefined)).toBeNull();
    expect(parseSocketHandshakeCredentials(null)).toBeNull();
  });

  it('returns null when token is missing, empty, or not a string', () => {
    expect(parseSocketHandshakeCredentials({})).toBeNull();
    expect(parseSocketHandshakeCredentials({ token: '' })).toBeNull();
    expect(parseSocketHandshakeCredentials({ token: '   ' })).toBeNull();
    expect(parseSocketHandshakeCredentials({ token: 123 })).toBeNull();
  });
});
