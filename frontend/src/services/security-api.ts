import { apiRequest } from "@/services/api";

/**
 * Paket 5.4.0-d/e: the security module — login rate limits, the aggregated
 * login-security counters and the bulk password reset. All three are
 * SUPER_ADMIN endpoints; the last two need a proof of identity that is either
 * a current TOTP code or a fresh passkey step-up marker for the action's own
 * purpose (a marker from another action is never accepted).
 */

export const identityStepUpPurpose = {
  /** Privacy and other generic sensitive actions. */
  identity: "identity-confirmation",
  rateLimits: "rate-limits-change",
  bulkPasswordReset: "bulk-password-reset",
} as const;

export type IdentityStepUpPurpose =
  (typeof identityStepUpPurpose)[keyof typeof identityStepUpPurpose];

export type SecurityRateLimitConfig = {
  readonly accountWindowSeconds: number;
  readonly accountDelayStartsAfterFailures: number;
  readonly accountDelayBaseMilliseconds: number;
  readonly accountDelayMaxMilliseconds: number;
  readonly ipMaxFailures: number;
  readonly ipWindowSeconds: number;
  readonly otherMaxFailures: number;
  readonly otherWindowSeconds: number;
};

export type SecurityRateLimitBounds = Readonly<
  Record<keyof SecurityRateLimitConfig, { readonly min: number; readonly max: number }>
>;

export type SecurityRateLimitSnapshot = {
  readonly config: SecurityRateLimitConfig;
  readonly bounds: SecurityRateLimitBounds;
};

export function getSecurityRateLimits(): Promise<SecurityRateLimitSnapshot> {
  return apiRequest("/security/rate-limits");
}

export function updateSecurityRateLimits(input: {
  readonly config: SecurityRateLimitConfig;
  readonly reason: string;
  readonly code?: string;
}): Promise<SecurityRateLimitSnapshot> {
  return apiRequest("/security/rate-limits", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export type LoginSecurityMetricEvent =
  | "login-429"
  | "login-account-delays"
  | "mfa-failures"
  | "hibp-skipped"
  // 5.4.1 (M3): the challenge counters the server keeps next to the four above.
  // The card draws the first four; these two are read from the endpoint.
  | "captcha-skipped"
  | "captcha-failed";

export type LoginSecurityMetricSeries = {
  readonly total: number;
  readonly peakPerMinute: number;
  readonly points: readonly { readonly at: string; readonly count: number }[];
};

export type LoginSecurityMetricsSnapshot = {
  readonly generatedAt: string;
  readonly windowSeconds: number;
  readonly metrics: Readonly<Record<LoginSecurityMetricEvent, LoginSecurityMetricSeries>>;
};

export function getLoginSecurityMetrics(): Promise<LoginSecurityMetricsSnapshot> {
  return apiRequest("/security/metrics/last-hour");
}

export type BulkPasswordResetResult = {
  readonly eligibleUsers: number;
  readonly changedUsers: number;
  readonly revokedSessions: number;
  readonly failedUsers: number;
};

export function bulkPasswordReset(input?: { readonly code?: string }): Promise<BulkPasswordResetResult> {
  return apiRequest("/security/bulk-password-reset", {
    method: "POST",
    body: JSON.stringify(input ?? {}),
  });
}

/**
 * Step-up for a sensitive action: the server returns WebAuthn request options
 * bound to the caller's session and the given purpose; the verification stores
 * a single-use marker that the action then consumes instead of a TOTP code.
 */
export function startIdentityStepUp(
  purpose: IdentityStepUpPurpose,
): Promise<{ options: Record<string, unknown> }> {
  return apiRequest("/security/identity/passkey/start", {
    method: "POST",
    body: JSON.stringify({ purpose }),
  });
}

export function completeIdentityStepUp(input: {
  readonly purpose: IdentityStepUpPurpose;
  readonly assertion: Record<string, unknown>;
}): Promise<void> {
  return apiRequest("/security/identity/passkey/verify", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
