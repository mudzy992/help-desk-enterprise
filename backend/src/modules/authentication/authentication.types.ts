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
  /** Paket 2.1: last local password change (expiry policy). */
  readonly passwordChangedAt?: Date | null;
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
  /** Paket 2.1: why — a temporary password or an expired one. */
  readonly reason?: 'temporary' | 'expired';
};

/** Paket 2.1 (M3): password accepted, second factor pending. */
export type MfaLoginResponse = {
  readonly status: 'MFA_REQUIRED' | 'MFA_ENROLLMENT_REQUIRED';
  readonly mfaToken: string;
  readonly expiresInSeconds: number;
};

export type AuthenticationLoginResponse =
  | AuthenticationSessionResponse
  | MustChangePasswordLoginResponse
  | MfaLoginResponse;

export type MfaTokenStage = 'verify' | 'enroll';

export type MfaTokenClaims = {
  readonly subjectId: string;
  readonly stage: MfaTokenStage;
  readonly jti: string;
  readonly expiresAt: number;
};

/** Paket 2.1 (M6): where the sign-in came from (session registry). */
export type SignInContext = {
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
};

export type SessionAccessTokenClaims = {
  readonly subjectId: string;
  /** Token id (null for tokens issued before revocation existed). */
  readonly jti: string | null;
  /** Paket 2.1: registry session id (`sid`); null for older tokens. */
  readonly sessionId: string | null;
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
