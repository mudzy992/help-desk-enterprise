import { Inject, Injectable } from '@nestjs/common';
import { createSocketPrincipal } from './create-socket-principal';
import { parseSocketHandshakeCredentials } from './parse-socket-handshake-credentials';
import type { SocketAuthenticationVerifier } from './socket-authentication.verifier';
import { SOCKET_AUTHENTICATION_VERIFIER } from './socket-authentication.verifier-token';
import type { SocketAuthenticationResult } from './socket-authentication.types';

@Injectable()
export class SocketAuthenticationService {
  constructor(
    @Inject(SOCKET_AUTHENTICATION_VERIFIER)
    private readonly verifier: SocketAuthenticationVerifier,
  ) {}

  async authenticate(handshakeAuth: unknown): Promise<SocketAuthenticationResult> {
    const credentials = parseSocketHandshakeCredentials(handshakeAuth);
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
