import { apiRequest } from "@/services/api";
import type { MfaEnrollmentSecret } from "@/services/auth-api";

/* Paket 2.1: own account security ("Sigurnost naloga") and the admin view. */

export type MfaRequirement = "required" | "optional" | "unavailable";

export type MfaStatus = {
  readonly requirement: MfaRequirement;
  readonly enabled: boolean;
  readonly enabledAt: string | null;
  readonly recoveryCodesRemaining: number;
  readonly serverConfigured: boolean;
};

export type PasskeyView = {
  readonly id: string;
  readonly deviceName: string | null;
  readonly aaguid: string | null;
  readonly createdAt: string;
  readonly lastUsedAt: string | null;
  readonly isBackedUp: boolean;
};

export type AccountSecurityOverview = {
  readonly mfa: MfaStatus;
  /** Paket 5.4.0-e: the registered passkeys and whether TOTP is enrolled. */
  readonly passkeys: readonly PasskeyView[];
  readonly hasTotp: boolean;
  readonly password: {
    readonly hasLocalPassword: boolean;
    readonly changedAt: string | null;
    readonly expiresAt: string | null;
    readonly minLength: number;
    readonly blocklistEnabled: boolean;
    readonly historyCount: number;
  };
};

export type UserSession = {
  readonly id: string;
  readonly provider: string;
  readonly mfaMethod: string | null;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  readonly createdAt: string;
  readonly lastSeenAt: string;
  readonly expiresAt: string;
  readonly current: boolean;
};

export type UserSecurity = {
  readonly mfa: MfaStatus;
  readonly passwordChangedAt: string | null;
  readonly passwordExpiresAt: string | null;
  readonly sessions: readonly UserSession[];
};

const post = (body?: unknown): RequestInit => ({
  method: "POST",
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

export const getAccountSecurity = (): Promise<AccountSecurityOverview> => apiRequest("/auth/security");

/* Paket 5.4.0-e: passkey ceremonies on the caller's own account. The confirm
   call carries the (optional) TOTP code the server asks for when the account
   already has TOTP — a stolen session alone must not be able to add a factor. */
export const startPasskeyRegistration = (): Promise<{ options: Record<string, unknown> }> =>
  apiRequest("/auth/security/passkey/register/start", post());

export const confirmPasskeyRegistration = (input: {
  readonly response: Record<string, unknown>;
  readonly code?: string;
}): Promise<{ passkey: PasskeyView }> =>
  apiRequest("/auth/security/passkey/register/confirm", post(input));

export const renamePasskey = (
  credentialId: string,
  deviceName: string,
): Promise<{ passkey: PasskeyView }> =>
  apiRequest(`/auth/security/passkey/${encodeURIComponent(credentialId)}`, {
    method: "PATCH",
    body: JSON.stringify({ deviceName }),
  });

export const removePasskey = (credentialId: string): Promise<void> =>
  apiRequest(`/auth/security/passkey/${encodeURIComponent(credentialId)}`, {
    method: "DELETE",
  });

export const changeOwnPassword = (input: { currentPassword: string; newPassword: string }): Promise<void> =>
  apiRequest("/auth/password", post(input));

export const listOwnSessions = (): Promise<{ items: readonly UserSession[] }> => apiRequest("/auth/sessions");

export const revokeOwnSession = (sessionId: string): Promise<void> =>
  apiRequest(`/auth/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });

export const revokeOtherSessions = (): Promise<{ revoked: number }> => apiRequest("/auth/sessions/revoke-others", post());

export const startMfaSetup = (): Promise<MfaEnrollmentSecret> => apiRequest("/auth/mfa/setup", post());

export const confirmMfaSetup = (code: string): Promise<{ recoveryCodes: readonly string[] }> =>
  apiRequest("/auth/mfa/setup/confirm", post({ code }));

export const disableMfa = (code: string): Promise<void> => apiRequest("/auth/mfa/disable", post({ code }));

export const regenerateRecoveryCodes = (code: string): Promise<{ recoveryCodes: readonly string[] }> =>
  apiRequest("/auth/mfa/recovery-codes", post({ code }));

export const getUserSecurity = (userId: string): Promise<UserSecurity> =>
  apiRequest(`/users/${encodeURIComponent(userId)}/security`);

export const revokeUserSessions = (userId: string): Promise<{ revoked: number }> =>
  apiRequest(`/users/${encodeURIComponent(userId)}/sessions/revoke-all`, post());

export const resetUserMfa = (userId: string, reason: string): Promise<void> =>
  apiRequest(`/users/${encodeURIComponent(userId)}/mfa/reset`, post({ reason }));
