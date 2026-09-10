import type {
  SocketAuthenticationResult,
  SocketHandshakeCredentials,
} from './socket-authentication.types';

export interface SocketAuthenticationVerifier {
  verify(
    credentials: SocketHandshakeCredentials,
  ): Promise<SocketAuthenticationResult>;
}
