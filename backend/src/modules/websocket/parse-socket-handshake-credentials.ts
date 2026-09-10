import type { SocketHandshakeCredentials } from './socket-authentication.types';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseSocketHandshakeCredentials(
  handshakeAuth: unknown,
): SocketHandshakeCredentials | null {
  if (!isPlainObject(handshakeAuth)) {
    return null;
  }
  const tokenValue = handshakeAuth['token'];
  if (typeof tokenValue !== 'string') {
    return null;
  }
  if (tokenValue.trim().length === 0) {
    return null;
  }
  return { token: tokenValue };
}
