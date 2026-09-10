import { Injectable } from '@nestjs/common';
import type { SocketAuthenticationVerifier } from '../websocket/socket-authentication.verifier';
import type {
  SocketAuthenticationResult,
  SocketHandshakeCredentials,
} from '../websocket/socket-authentication.types';
import { SessionTokenService } from './session-token.service';

@Injectable()
export class JwtSocketAuthenticationVerifier
  implements SocketAuthenticationVerifier
{
  constructor(private readonly sessionTokenService: SessionTokenService) {}

  async verify(
    credentials: SocketHandshakeCredentials,
  ): Promise<SocketAuthenticationResult> {
    try {
      const claims = await this.sessionTokenService.verify(credentials.token);
      return {
        status: 'authenticated',
        principal: { subjectId: claims.subjectId },
      };
    } catch {
      return { status: 'unauthenticated', reason: 'invalid_credentials' };
    }
  }
}
