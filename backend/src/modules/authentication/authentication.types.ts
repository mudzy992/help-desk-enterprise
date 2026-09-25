export type AuthenticationMode = 'local' | 'entra_ad';

export type PasswordAuthenticationCredentials = {
  readonly kind: 'password';
  readonly email: string;
  readonly password: string;
};

export type EntraIdTokenAuthenticationCredentials = {
  readonly kind: 'entra_id_token';
  readonly idToken: string;
};

export type AuthenticationCredentials =
  | PasswordAuthenticationCredentials
  | EntraIdTokenAuthenticationCredentials;

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
  readonly mustChangePassword: boolean;
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

export type MustChangePasswordLoginResponse = {
  readonly status: 'MUST_CHANGE_PASSWORD';
  readonly passwordChangeToken: string;
  readonly expiresInSeconds: number;
};

export type AuthenticationLoginResponse =
  | AuthenticationSessionResponse
  | MustChangePasswordLoginResponse;

export type SessionAccessTokenClaims = {
  readonly subjectId: string;
  /** Token id (null for tokens issued before revocation existed). */
  readonly jti: string | null;
  readonly issuedAt: number;
  readonly expiresAt: number;
};

export type PasswordChangeTokenClaims = {
  readonly subjectId: string;
  readonly purpose: 'password_change';
};

export interface AuthenticationProvider {
  authenticate(
    credentials: AuthenticationCredentials,
  ): Promise<AuthenticatedPrincipal>;
}
