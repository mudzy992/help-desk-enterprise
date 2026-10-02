import { createPublicKey, type KeyObject } from 'node:crypto';
import { decode, verify } from 'jsonwebtoken';
import { TeamsError } from './teams.error';

export const botConnectorOpenIdMetadataUrl = 'https://login.botframework.com/v1/.well-known/openidconfiguration';
export const botConnectorIssuer = 'https://api.botframework.com';
const keyCacheMs = 24 * 60 * 60_000;

interface CachedKeys {
  readonly fetchedAt: number;
  readonly keys: ReadonlyMap<string, { key: KeyObject; endorsements: readonly string[] }>;
}

export interface ValidatedBotActivityToken {
  readonly serviceUrl: string;
  readonly claims: Readonly<Record<string, unknown>>;
}

/**
 * Validates the `Authorization: Bearer` JWT that Bot Connector attaches to
 * every inbound activity: RS256 signature from the published key set (cached
 * 24 h, refreshed on unknown kid), issuer, audience = our app ID, `msteams`
 * endorsement and the `serviceUrl` claim matching the activity.
 */
export class BotConnectorJwtValidator {
  private cache: CachedKeys | null = null;

  constructor(
    private readonly fetchImplementation: typeof fetch,
    private readonly now: () => number = Date.now,
  ) {}

  async validate(input: { authorizationHeader: string | undefined; appId: string; activityServiceUrl: string }): Promise<ValidatedBotActivityToken> {
    const token = /^Bearer\s+(.+)$/i.exec(input.authorizationHeader?.trim() ?? '')?.[1];
    if (!token || !input.appId) throw new TeamsError('UNAUTHORIZED_ACTIVITY', 'Missing bearer token');
    const decoded = decode(token, { complete: true });
    if (!decoded || typeof decoded === 'string' || decoded.header.alg !== 'RS256' || typeof decoded.header.kid !== 'string') throw new TeamsError('UNAUTHORIZED_ACTIVITY', 'Malformed token');
    const entry = await this.findKey(decoded.header.kid);
    if (!entry.endorsements.includes('msteams')) throw new TeamsError('UNAUTHORIZED_ACTIVITY', 'Key not endorsed for msteams');
    let claims: Record<string, unknown>;
    try {
      const payload = verify(token, entry.key, { algorithms: ['RS256'], issuer: botConnectorIssuer, audience: input.appId, clockTolerance: 300 });
      if (!payload || typeof payload !== 'object') throw new Error('payload');
      claims = payload as Record<string, unknown>;
    } catch {
      throw new TeamsError('UNAUTHORIZED_ACTIVITY', 'Token verification failed');
    }
    const serviceUrl = typeof claims.serviceurl === 'string' ? claims.serviceurl : typeof claims.serviceUrl === 'string' ? claims.serviceUrl : '';
    if (!serviceUrl || normalize(serviceUrl) !== normalize(input.activityServiceUrl)) throw new TeamsError('UNAUTHORIZED_ACTIVITY', 'serviceUrl claim mismatch');
    return { serviceUrl, claims };
  }

  private async findKey(kid: string) {
    const fresh = this.cache && this.now() - this.cache.fetchedAt < keyCacheMs;
    let found = fresh ? this.cache?.keys.get(kid) : undefined;
    if (!found) {
      this.cache = await this.loadKeys();
      found = this.cache.keys.get(kid);
    }
    if (!found) throw new TeamsError('UNAUTHORIZED_ACTIVITY', 'Unknown signing key');
    return found;
  }

  private async loadKeys(): Promise<CachedKeys> {
    const metadata = await this.getJson(botConnectorOpenIdMetadataUrl);
    const jwksUri = metadata && typeof metadata.jwks_uri === 'string' ? metadata.jwks_uri : null;
    if (!jwksUri || !jwksUri.startsWith('https://')) throw new TeamsError('TOKEN_UNAVAILABLE', 'OpenID metadata without jwks_uri');
    const jwks = await this.getJson(jwksUri);
    const keys = new Map<string, { key: KeyObject; endorsements: readonly string[] }>();
    for (const jwk of Array.isArray(jwks?.keys) ? (jwks.keys as Record<string, unknown>[]) : []) {
      if (typeof jwk.kid !== 'string') continue;
      try {
        const key = createPublicKey({ key: jwk as never, format: 'jwk' });
        const endorsements = Array.isArray(jwk.endorsements) ? jwk.endorsements.filter((e): e is string => typeof e === 'string') : [];
        keys.set(jwk.kid, { key, endorsements });
      } catch {
        // Skip keys Node cannot import; others remain usable.
      }
    }
    return { fetchedAt: this.now(), keys };
  }

  private async getJson(url: string): Promise<Record<string, unknown> | null> {
    try {
      const response = await this.fetchImplementation(url, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(String(response.status));
      return (await response.json()) as Record<string, unknown>;
    } catch {
      throw new TeamsError('TOKEN_UNAVAILABLE', `Cannot load ${url}`);
    }
  }
}

function normalize(url: string): string {
  return url.trim().replace(/\/+$/, '').toLowerCase();
}
