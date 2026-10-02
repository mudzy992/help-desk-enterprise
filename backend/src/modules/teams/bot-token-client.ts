import { createHash, createPrivateKey, randomUUID, X509Certificate } from 'node:crypto';
import { sign } from 'jsonwebtoken';
import { TeamsError } from './teams.error';

export interface BotCredentials {
  readonly tenantId: string;
  readonly appId: string;
  readonly appSecret: string;
  /** Certificate + private key (PEM); preferred over the secret when present. */
  readonly certificatePem?: string;
}

/** Scope of the Bot Connector API (client credentials grant). */
export const botConnectorScope = 'https://api.botframework.com/.default';
const refreshMarginMs = 5 * 60_000;

/**
 * Single-tenant client-credentials token client (new multi-tenant Azure Bot
 * resources cannot be created since 31.7.2025). Tokens are cached per app
 * and refreshed five minutes before expiry; concurrent callers share one request.
 */
export class BotTokenClient {
  private cache: { key: string; token: string; expiresAt: number } | null = null;
  private inflight: Promise<string> | null = null;

  constructor(
    private readonly fetchImplementation: typeof fetch,
    private readonly now: () => number = Date.now,
  ) {}

  async getToken(credentials: BotCredentials): Promise<string> {
    const key = `${credentials.tenantId}:${credentials.appId}`;
    if (this.cache?.key === key && this.cache.expiresAt - refreshMarginMs > this.now()) return this.cache.token;
    if (this.inflight) return this.inflight;
    this.inflight = this.requestToken(credentials, key).finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  invalidate(): void {
    this.cache = null;
  }

  private async requestToken(credentials: BotCredentials, key: string): Promise<string> {
    const certificatePem = credentials.certificatePem?.trim() ?? '';
    if (!credentials.tenantId || !credentials.appId || (!credentials.appSecret && !certificatePem)) throw new TeamsError('NOT_CONFIGURED', 'Bot credentials are incomplete');
    const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(credentials.tenantId)}/oauth2/v2.0/token`;
    const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: credentials.appId, scope: botConnectorScope });
    if (certificatePem) {
      body.set('client_assertion_type', 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer');
      body.set('client_assertion', buildClientAssertion(certificatePem, credentials.appId, tokenUrl, this.now()));
    } else {
      body.set('client_secret', credentials.appSecret);
    }
    let response: Response;
    try {
      response = await this.fetchImplementation(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: body.toString(),
      });
    } catch {
      throw new TeamsError('TOKEN_UNAVAILABLE', 'Token endpoint unreachable');
    }
    if (response.status === 400 || response.status === 401) throw new TeamsError('NOT_CONFIGURED', `Token request rejected (${response.status})`);
    if (!response.ok) throw new TeamsError('TOKEN_UNAVAILABLE', `Token endpoint returned ${response.status}`);
    const json = (await response.json().catch(() => null)) as { access_token?: unknown; expires_in?: unknown } | null;
    if (!json || typeof json.access_token !== 'string') throw new TeamsError('TOKEN_UNAVAILABLE', 'Malformed token response');
    const expiresIn = typeof json.expires_in === 'number' ? json.expires_in : Number(json.expires_in ?? 3600);
    this.cache = { key, token: json.access_token, expiresAt: this.now() + (Number.isFinite(expiresIn) ? expiresIn : 3600) * 1000 };
    return json.access_token;
  }
}

/** RFC 7523 client assertion signed with the app certificate (Entra expects `x5t`). */
export function buildClientAssertion(pem: string, appId: string, audience: string, nowMs: number): string {
  const certificateBlock = /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/.exec(pem)?.[0];
  const keyBlock = /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA |EC )?PRIVATE KEY-----/.exec(pem)?.[0];
  if (!certificateBlock || !keyBlock) throw new TeamsError('NOT_CONFIGURED', 'Certificate PEM must contain a certificate and a private key');
  let x5t: string;
  let key: ReturnType<typeof createPrivateKey>;
  try {
    x5t = createHash('sha1').update(new X509Certificate(certificateBlock).raw).digest('base64url');
    key = createPrivateKey(keyBlock);
  } catch {
    throw new TeamsError('NOT_CONFIGURED', 'Certificate PEM cannot be read');
  }
  const issuedAt = Math.floor(nowMs / 1000);
  return sign({ aud: audience, iss: appId, sub: appId, jti: randomUUID(), nbf: issuedAt, iat: issuedAt, exp: issuedAt + 600 }, key, {
    algorithm: 'RS256',
    header: { alg: 'RS256', typ: 'JWT', x5t },
  });
}
