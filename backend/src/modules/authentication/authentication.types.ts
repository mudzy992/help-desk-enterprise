export type AuthenticationMode = 'local' | 'entra_ad';

export type PasswordAuthenticationCredentials = {
  readonly kind: 'password';
  readonly email: string;
  readonly password: string;
};

export type ExternalIdentityAuthenticationCredentials = {
  readonly kind: 'external_identity';
  readonly externalSubject: string;
  readonly email: string;
  readonly displayName: string;
};

export type AuthenticationCredentials =
  | PasswordAuthenticationCredentials
  | ExternalIdentityAuthenticationCredentials;

export type AuthenticatedPrincipal = {
  readonly subjectId: string;
  readonly email: string;
  readonly displayName: string;
  readonly isLocalOnly: boolean;
};

export type AuthorizationPrincipal = {
  readonly subjectId: string;
  readonly email: string;
  readonly displayName: string;
  readonly isLocalOnly: boolean;
};

export type AuthenticationUserRecord = {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly isActive: boolean;
  readonly isLocalOnly: boolean;
  readonly localPasswordHash: string | null;
  readonly entraObjectId: string | null;
  readonly roleKeys: readonly string[];
};

export type AuthenticationSessionResponse = {
  readonly accessToken: string;
  readonly tokenType: 'Bearer';
  readonly expiresInSeconds: number;
  readonly principal: AuthorizationPrincipal;
};

export type SessionAccessTokenClaims = {
  readonly subjectId: string;
};

export interface AuthenticationProvider {
  authenticate(
    credentials: AuthenticationCredentials,
  ): Promise<AuthenticatedPrincipal>;
}
