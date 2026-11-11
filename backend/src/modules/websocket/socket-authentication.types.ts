export interface SocketHandshakeCredentials {
  readonly token: string;
}

export interface SocketPrincipal {
  readonly subjectId: string;
  readonly sessionId: string | null;
  readonly jti: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
  readonly authzVersion: number;
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
