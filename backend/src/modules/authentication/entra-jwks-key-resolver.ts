import {
  createPublicKey,
  type JsonWebKey as CryptoJsonWebKey,
  type KeyObject,
} from 'node:crypto';
import { Logger } from '@nestjs/common';
import { AuthenticationError } from './authentication.error';

/*
  W2.19 (`BA-authentication-06`): the Entra JWKS document used to be fetched on
  every sign-in with `fetch(jwksUrl)` — no timeout, no cache, no bound on the
  response. One slow Microsoft answer could hold the request open for as long as
  the socket lived, and a login burst (or a Microsoft blip) multiplied the same
  request per user. This resolver is the single place that talks to the JWKS
  endpoint, and it owns the four decisions the audit asked for:

    1. **timeout** — every fetch is aborted after `fetchTimeoutMilliseconds`
       (the request fails closed with `AUTHENTICATION_UNAVAILABLE`);
    2. **cache** — one document per `jwksUrl`, reused for
       `cacheTtlMilliseconds`; MS rotates signing keys on the order of weeks, and
       an unknown `kid` forces an early refresh, so a long TTL costs nothing;
    3. **one refresh on an unknown `kid`** — key rotation is picked up on the
       first token that carries the new `kid`, without a restart; a short cooldown
       after each fetch keeps an attacker-supplied `kid` from driving the fetches;
    4. **bounded document** — `content-length` and the decoded body are both
       capped at `maxDocumentBytes`, so a hostile/broken endpoint cannot turn a
       sign-in into an unbounded read.

  Two behaviours worth stating explicitly:

  * **Single flight.** Concurrent sign-ins share one refresh (`pending` map), so
    a cold cache under burst is one external call, not one per user.
  * **Stale on transport failure.** If a refresh fails and a usable document is
    already cached, the cached keys keep working (logged as a warning) until
    `maxStaleMilliseconds`. Without it, any Microsoft/network blip is a total
    Entra sign-in outage; with it, the exposure is bounded by the outage and the
    keys are still the ones the issuer published. Only a *transport* failure can
    fall back — a malformed or oversized document is an error, never a reason to
    keep trusting something older.
*/

export const entraJwksConstants = {
  /** A sign-in must not wait longer than this for the key document. */
  fetchTimeoutMilliseconds: 5_000,
  /** Signing keys rotate rarely; an unknown `kid` shortens this anyway. */
  cacheTtlMilliseconds: 24 * 60 * 60 * 1000,
  /** Upper bound on how long cached keys may serve while refreshes keep failing. */
  maxStaleMilliseconds: 7 * 24 * 60 * 60 * 1000,
  /**
   * Guard on the rotation refresh: a document fetched less than this ago is not
   * re-fetched for an unknown `kid`. The `kid` in a token is attacker-supplied and
   * Microsoft keeps the previous key valid for hours, so an unknown `kid` is served
   * from the cache for this long instead of letting anyone turn random `kid`s into
   * an outbound-request amplifier.
   */
  keyRefreshCooldownMilliseconds: 30_000,
  /** Real Entra documents are a few kilobytes; this is a hard ceiling, not a target. */
  maxDocumentBytes: 256 * 1024,
} as const;

type EntraJsonWebKey = CryptoJsonWebKey & {
  readonly kid?: string;
};

/**
 * The endpoint could not be reached (network, timeout, non-2xx, unreadable body).
 * Only this kind of failure may fall back to a cached document; a malformed or
 * oversized answer is a reason to trust *less*, never to keep trusting old keys.
 */
class JwksTransportError extends Error {}

type CachedDocument = {
  readonly keys: ReadonlyMap<string, EntraJsonWebKey>;
  readonly fetchedAt: number;
};

/** Diagnostics counters: enough to see cache behaviour in a log line or a test. */
export type EntraJwksResolverStats = {
  readonly cacheHits: number;
  readonly fetches: number;
  readonly timeouts: number;
  readonly staleServed: number;
  readonly unknownKeyRefreshes: number;
};

export type EntraJwksKeyResolver = {
  resolve(input: { readonly jwksUrl: string; readonly keyId: string }): Promise<KeyObject>;
  stats(): EntraJwksResolverStats;
};

export type EntraJwksKeyResolverOptions = {
  readonly fetchImplementation: typeof fetch;
  readonly now?: () => number;
  readonly logger?: Pick<Logger, 'warn'>;
  readonly fetchTimeoutMilliseconds?: number;
  readonly cacheTtlMilliseconds?: number;
  readonly maxStaleMilliseconds?: number;
  readonly maxDocumentBytes?: number;
  readonly keyRefreshCooldownMilliseconds?: number;
};

export function createEntraJwksKeyResolver(
  options: EntraJwksKeyResolverOptions,
): EntraJwksKeyResolver {
  const now = options.now ?? Date.now;
  const logger = options.logger ?? new Logger('EntraJwksKeyResolver');
  const timeoutMilliseconds =
    options.fetchTimeoutMilliseconds ?? entraJwksConstants.fetchTimeoutMilliseconds;
  const cacheTtlMilliseconds = options.cacheTtlMilliseconds ?? entraJwksConstants.cacheTtlMilliseconds;
  const maxStaleMilliseconds = options.maxStaleMilliseconds ?? entraJwksConstants.maxStaleMilliseconds;
  const maxDocumentBytes = options.maxDocumentBytes ?? entraJwksConstants.maxDocumentBytes;
  const keyRefreshCooldownMilliseconds =
    options.keyRefreshCooldownMilliseconds ?? entraJwksConstants.keyRefreshCooldownMilliseconds;

  const cached = new Map<string, CachedDocument>();
  const pending = new Map<string, Promise<CachedDocument>>();
  const counters = { cacheHits: 0, fetches: 0, timeouts: 0, staleServed: 0, unknownKeyRefreshes: 0 };

  async function loadDocument(jwksUrl: string): Promise<CachedDocument> {
    const inFlight = pending.get(jwksUrl);
    if (inFlight !== undefined) return inFlight;
    const fetchOnce = (async () => {
      counters.fetches += 1;
      const document = await fetchJwksDocument(jwksUrl, {
        fetchImplementation: options.fetchImplementation,
        timeoutMilliseconds,
        maxDocumentBytes,
        onTimeout: () => {
          counters.timeouts += 1;
        },
      });
      const entry: CachedDocument = { keys: document, fetchedAt: now() };
      cached.set(jwksUrl, entry);
      return entry;
    })().finally(() => {
      pending.delete(jwksUrl);
    });
    pending.set(jwksUrl, fetchOnce);
    return fetchOnce;
  }

  /**
   * Fresh within the TTL, or a bounded stale fallback when the refresh failed.
   * `forceRefresh` bypasses the TTL and is used only for an unknown `kid`.
   */
  async function readDocument(
    jwksUrl: string,
    allowStale: boolean,
    forceRefresh = false,
  ): Promise<CachedDocument> {
    const entry = cached.get(jwksUrl);
    if (!forceRefresh && entry !== undefined && now() - entry.fetchedAt < cacheTtlMilliseconds) {
      counters.cacheHits += 1;
      return entry;
    }
    try {
      return await loadDocument(jwksUrl);
    } catch (error) {
      if (!(error instanceof JwksTransportError)) throw error;
      const usable =
        allowStale && entry !== undefined && now() - entry.fetchedAt <= maxStaleMilliseconds;
      if (!usable) throw new AuthenticationError('AUTHENTICATION_UNAVAILABLE');
      counters.staleServed += 1;
      logger.warn(
        `Entra JWKS refresh failed for ${jwksUrl}; serving the cached document from ${new Date(entry.fetchedAt).toISOString()}`,
      );
      return entry;
    }
  }

  return {
    async resolve(input) {
      let document = await readDocument(input.jwksUrl, true);
      let key = document.keys.get(input.keyId);
      if (key === undefined && now() - document.fetchedAt >= keyRefreshCooldownMilliseconds) {
        // Key rotation: the set is complete but does not carry this `kid`. One
        // forced refresh (single-flighted, cooldown-guarded) is the only thing
        // that may help; anything younger than the cooldown is refused as is.
        counters.unknownKeyRefreshes += 1;
        document = await readDocument(input.jwksUrl, true, true);
        key = document.keys.get(input.keyId);
      }
      if (key === undefined) throw new AuthenticationError('INVALID_CREDENTIALS');
      try {
        return createPublicKey({ key, format: 'jwk' });
      } catch {
        throw new AuthenticationError('AUTHENTICATION_UNAVAILABLE');
      }
    },
    stats: () => ({ ...counters }),
  };
}

async function fetchJwksDocument(
  jwksUrl: string,
  input: {
    readonly fetchImplementation: typeof fetch;
    readonly timeoutMilliseconds: number;
    readonly maxDocumentBytes: number;
    readonly onTimeout: () => void;
  },
): Promise<ReadonlyMap<string, EntraJsonWebKey>> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    input.onTimeout();
    controller.abort();
  }, input.timeoutMilliseconds);
  try {
    let response: Response;
    try {
      response = await input.fetchImplementation(jwksUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
    } catch {
      throw new JwksTransportError('jwks fetch failed');
    }
    if (!response.ok) throw new JwksTransportError('jwks endpoint answered non-2xx');
    const declaredLength = Number(response.headers?.get?.('content-length') ?? Number.NaN);
    if (Number.isFinite(declaredLength) && declaredLength > input.maxDocumentBytes) {
      throw new AuthenticationError('AUTHENTICATION_UNAVAILABLE');
    }
    let text: string;
    try {
      text = await response.text();
    } catch {
      throw new JwksTransportError('jwks body could not be read');
    }
    if (Buffer.byteLength(text, 'utf8') > input.maxDocumentBytes) {
      throw new AuthenticationError('AUTHENTICATION_UNAVAILABLE');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new AuthenticationError('AUTHENTICATION_UNAVAILABLE');
    }
    return parseJwksDocument(parsed);
  } finally {
    clearTimeout(timer);
  }
}

function parseJwksDocument(document: unknown): ReadonlyMap<string, EntraJsonWebKey> {
  if (
    document === null ||
    typeof document !== 'object' ||
    !('keys' in document) ||
    !Array.isArray(document.keys)
  ) {
    throw new AuthenticationError('AUTHENTICATION_UNAVAILABLE');
  }
  const keys = new Map<string, EntraJsonWebKey>();
  for (const value of document.keys) {
    const key = asEntraJsonWebKey(value);
    if (key !== undefined && typeof key.kid === 'string' && key.kid.length > 0) {
      keys.set(key.kid, key);
    }
  }
  return keys;
}

function asEntraJsonWebKey(value: unknown): EntraJsonWebKey | undefined {
  return value !== null && typeof value === 'object' ? (value as EntraJsonWebKey) : undefined;
}
