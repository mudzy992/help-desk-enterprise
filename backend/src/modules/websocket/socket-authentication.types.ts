export interface SocketHandshakeCredentials {
  readonly token: string;
}

export interface SocketPrincipal {
  readonly subjectId: string;
}

export type SocketAuthenticationFailureReason =
  | 'missing_credentials'
  | 'invalid_credentials';

export type SocketAuthenticationResult =
  | {
      readonly status: 'authenticated';
      readonly principal: SocketPrincipal;
    }
  | {
      readonly status: 'unauthenticated';
      readonly reason: SocketAuthenticationFailureReason;
    };
