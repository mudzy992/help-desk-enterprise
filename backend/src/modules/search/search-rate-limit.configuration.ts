/**
 * W7.59 (BA-search-05): the request budget of `GET /search`.
 *
 * The limits are deployment settings (environment variables), not admin
 * settings: this is a security control of the endpoint, so it is tuned with the
 * deployment that owns the traffic shape and it can never be widened at runtime
 * by an operator who only has the admin panel.
 *
 * Values that cannot be parsed fall back to the **default**, never to a weaker
 * limit, and the bounds keep a typo from turning the bucket into either a
 * lock-out (`0`) or no protection at all. The `enabled` switch is the documented
 * break-glass: an incident commander may turn the budget off for a deployment,
 * but the default is on and a restart is required to change it.
 */

export type SearchRateLimitConfiguration = {
  readonly enabled: boolean;
  readonly windowSeconds: number;
  /** Requests one signed-in actor may make inside the window. */
  readonly actorRequestsPerWindow: number;
  /** Requests one client address may make inside the window (all actors). */
  readonly ipRequestsPerWindow: number;
};

/**
 * A human uses the palette a few times a minute (debounce plus a 2-character
 * minimum), so 30 requests per minute per actor is generous for people and caps
 * a script at 30 × 25 = 750 result rows a minute. The address bucket is wider
 * because a NATed office shares one address; it still caps the aggregate.
 */
export const defaultSearchRateLimitConfiguration: SearchRateLimitConfiguration = {
  enabled: true,
  windowSeconds: 60,
  actorRequestsPerWindow: 30,
  ipRequestsPerWindow: 60,
};

export const searchRateLimitBounds = {
  windowSeconds: { min: 10, max: 3_600 },
  actorRequestsPerWindow: { min: 5, max: 10_000 },
  ipRequestsPerWindow: { min: 5, max: 10_000 },
} as const;

/**
 * The four keys are read through literal property access on the environment
 * object, not through a lookup map: `scripts/check-env-example.mjs` treats an env
 * key as "read" only when it can see that access, and the deployment contract in
 * `.env.example` must stay authoritative in both directions.
 */
type Environment = Record<string, string | undefined>;

export function loadSearchRateLimitConfiguration(
  environment: Environment = process.env,
): SearchRateLimitConfiguration {
  const defaults = defaultSearchRateLimitConfiguration;
  return {
    enabled: parseEnabled(environment.SEARCH_RATE_LIMIT_ENABLED),
    windowSeconds: parseBoundedInteger(
      environment.SEARCH_RATE_LIMIT_WINDOW_SECONDS,
      defaults.windowSeconds,
      searchRateLimitBounds.windowSeconds,
    ),
    actorRequestsPerWindow: parseBoundedInteger(
      environment.SEARCH_RATE_LIMIT_ACTOR_PER_WINDOW,
      defaults.actorRequestsPerWindow,
      searchRateLimitBounds.actorRequestsPerWindow,
    ),
    ipRequestsPerWindow: parseBoundedInteger(
      environment.SEARCH_RATE_LIMIT_IP_PER_WINDOW,
      defaults.ipRequestsPerWindow,
      searchRateLimitBounds.ipRequestsPerWindow,
    ),
  };
}

/** Only an explicit `false`/`0`/`off`/`no` disables the budget. */
function parseEnabled(raw: string | undefined): boolean {
  if (raw === undefined) {
    return true;
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized.length === 0) {
    return true;
  }
  return !['false', '0', 'off', 'no'].includes(normalized);
}

function parseBoundedInteger(
  raw: string | undefined,
  fallback: number,
  bounds: { readonly min: number; readonly max: number },
): number {
  if (raw === undefined || raw.trim().length === 0) {
    return fallback;
  }
  const parsed = Number(raw.trim());
  if (
    !Number.isInteger(parsed) ||
    parsed < bounds.min ||
    parsed > bounds.max
  ) {
    return fallback;
  }
  return parsed;
}
