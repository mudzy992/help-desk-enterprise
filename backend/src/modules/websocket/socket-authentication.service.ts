import { Inject, Injectable } from '@nestjs/common';
import { isAllowedOrigin } from '../../common/cors/is-allowed-origin';
import { readSessionCookie } from '../authentication/session-cookie';
import { createSocketPrincipal } from './create-socket-principal';
import { parseSocketHandshakeCredentials } from './parse-socket-handshake-credentials';
import type { SocketAuthenticationVerifier } from './socket-authentication.verifier';
import { SOCKET_AUTHENTICATION_VERIFIER } from './socket-authentication.verifier-token';
import type {
  SocketAuthenticationResult,
  SocketHandshakeCredentials,
} from './socket-authentication.types';

export type SocketHandshakeHeaders = {
  readonly cookie?: string | string[];
  readonly origin?: string | string[];
};

@Injectable()
export class SocketAuthenticationService {
  constructor(
    @Inject(SOCKET_AUTHENTICATION_VERIFIER)
    private readonly verifier: SocketAuthenticationVerifier,
  ) {}

  async authenticate(
    handshakeAuth: unknown,
    handshakeHeaders: SocketHandshakeHeaders = {},
  ): Promise<SocketAuthenticationResult> {
    const credentials = readHandshakeCredentials(handshakeAuth, handshakeHeaders);
    if (credentials === 'origin_rejected') {
      return { status: 'unauthenticated', reason: 'invalid_credentials' };
    }
    if (credentials === null) {
      return { status: 'unauthenticated', reason: 'missing_credentials' };
    }
    const result = await this.verifier.verify(credentials);
    if (result.status !== 'authenticated') {
      return { status: 'unauthenticated', reason: result.reason };
    }
    if (result.principal.subjectId.trim().length === 0) {
      return { status: 'unauthenticated', reason: 'invalid_credentials' };
    }
    return {
      status: 'authenticated',
      principal: createSocketPrincipal(result.principal.subjectId),
    };
  }
}

/**
 * An explicit `auth.token` (non-browser clients) wins. The browser app sends
 * its HttpOnly session cookie instead; a cookie is only honoured from an
 * allowed origin, which blocks cross-site WebSocket hijacking.
 */
function readHandshakeCredentials(
  handshakeAuth: unknown,
  handshakeHeaders: SocketHandshakeHeaders,
): SocketHandshakeCredentials | 'origin_rejected' | null {
  const explicit = parseSocketHandshakeCredentials(handshakeAuth);
  if (explicit !== null) {
    return explicit;
  }
  const cookieToken = readSessionCookie(handshakeHeaders.cookie);
  if (cookieToken === null) {
    return null;
  }
  if (!isAllowedOrigin(handshakeHeaders.origin)) {
    return 'origin_rejected';
  }
  return { token: cookieToken };
}
