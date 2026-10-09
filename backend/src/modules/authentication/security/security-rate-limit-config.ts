/*
  Paket 5.4.0-b (M2): the configurable login rate limits. The values used to be
  the hard-coded `passwordLoginLimits`/`loginAttemptLimits` constants; they are
  now scalar settings (`private.security.rateLimits.*`) with the old constants
  as defaults, so a deployment that never opens the admin panel behaves exactly
  as before.

  Pure decisions only — bounds, defaults and the cross-rule — so the matrix is
  unit tested like the other configuration parsers.
*/

export type SecurityRateLimitConfig = {
  /** Password sign-in: how long an account's failure bucket lives. */
  readonly accountWindowSeconds: number;
  /** Failed attempts before an account's attempts start feeling a delay. */
  readonly accountDelayStartsAfterFailures: number;
  /** First delayed failure waits this long, then doubles per failure. */
  readonly accountDelayBaseMilliseconds: number;
  /** Upper bound of the progressive account delay. */
  readonly accountDelayMaxMilliseconds: number;
  /** Failed sign-ins from one IP before it receives a temporary 429. */
  readonly ipMaxFailures: number;
  /** How long the IP 429 bucket lives. */
  readonly ipWindowSeconds: number;
  /** Entra / password-change / MFA confirmations: failures before a 429. */
  readonly otherMaxFailures: number;
  /** Window of the `other` bucket. */
  readonly otherWindowSeconds: number;
};

/** Defaults equal the pre-5.4 hard-coded behaviour. */
export const defaultSecurityRateLimitConfig: SecurityRateLimitConfig = {
  accountWindowSeconds: 30 * 60,
  accountDelayStartsAfterFailures: 3,
  accountDelayBaseMilliseconds: 250,
  accountDelayMaxMilliseconds: 2_000,
  ipMaxFailures: 40,
  ipWindowSeconds: 5 * 60,
  otherMaxFailures: 5,
  otherWindowSeconds: 15 * 60,
};

/**
 * Bounds that keep the protection intact (design M2): an administrator can
 * tune the limits, not disable them. `ipMaxFailures` cannot exceed 500 and no
 * window can drop below 10 seconds.
 */
export const securityRateLimitBounds = {
  accountWindowSeconds: { min: 60, max: 86_400 },
  accountDelayStartsAfterFailures: { min: 1, max: 20 },
  accountDelayBaseMilliseconds: { min: 0, max: 5_000 },
  accountDelayMaxMilliseconds: { min: 0, max: 10_000 },
  ipMaxFailures: { min: 10, max: 500 },
  ipWindowSeconds: { min: 10, max: 3_600 },
  otherMaxFailures: { min: 3, max: 100 },
  otherWindowSeconds: { min: 10, max: 86_400 },
} as const satisfies Record<keyof SecurityRateLimitConfig, { min: number; max: number }>;

export class SecurityRateLimitConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityRateLimitConfigError';
  }
}

export function isIntegerWithinBounds(
  value: unknown,
  bounds: { min: number; max: number },
): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= bounds.min && value <= bounds.max;
}

/** Validates one configuration; the message names the first violated field. */
export function assertSecurityRateLimitConfig(config: {
  readonly [K in keyof SecurityRateLimitConfig]: unknown;
}): SecurityRateLimitConfig {
  for (const key of Object.keys(securityRateLimitBounds) as Array<keyof SecurityRateLimitConfig>) {
    const bounds = securityRateLimitBounds[key];
    if (!isIntegerWithinBounds(config[key], bounds)) {
      throw new SecurityRateLimitConfigError(`${key} must be an integer between ${bounds.min} and ${bounds.max}`);
    }
  }
  const result = config as SecurityRateLimitConfig;
  if (result.accountDelayMaxMilliseconds < result.accountDelayBaseMilliseconds) {
    throw new SecurityRateLimitConfigError('accountDelayMaxMilliseconds must not be below accountDelayBaseMilliseconds');
  }
  if (result.accountDelayStartsAfterFailures > result.ipMaxFailures) {
    throw new SecurityRateLimitConfigError(
      'accountDelayStartsAfterFailures must not exceed ipMaxFailures (the IP bucket would open first every time)',
    );
  }
  return result;
}
