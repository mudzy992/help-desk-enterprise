import { Injectable } from '@nestjs/common';
import type { SocketAuthenticationVerifier } from './socket-authentication.verifier';
import type {
  SocketAuthenticationResult,
  SocketHandshakeCredentials,
} from './socket-authentication.types';

@Injectable()
export class UnavailableSocketAuthenticationVerifier
  implements SocketAuthenticationVerifier
{
  async verify(
    _credentials: SocketHandshakeCredentials,
  ): Promise<SocketAuthenticationResult> {
    return { status: 'unauthenticated', reason: 'invalid_credentials' };
  }
}
