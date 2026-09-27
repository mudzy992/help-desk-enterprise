/** Paket 2.3: client-credentials token from Microsoft Entra ID (no SDK). */
export type EntraApplication = { readonly tenantId: string; readonly clientId: string; readonly clientSecret: string };

type CachedToken = { readonly token: string; readonly expiresAt: number };
const cache = new Map<string, CachedToken>();

export async function fetchEntraAccessToken(
  application: EntraApplication,
  scope: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const cacheKey = `${application.tenantId}:${application.clientId}:${scope}`;
  const cached = cache.get(cacheKey);
  if (cached !== undefined && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const response = await fetchImpl(
    `https://login.microsoftonline.com/${encodeURIComponent(application.tenantId)}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: application.clientId,
        client_secret: application.clientSecret,
        scope,
        grant_type: 'client_credentials',
      }).toString(),
      signal: AbortSignal.timeout(15_000),
    },
  );
  const body = (await response.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (!response.ok || typeof body.access_token !== 'string') {
    throw new Error(`ENTRA_TOKEN_FAILED ${response.status} ${body.error ?? ''}`.trim());
  }
  cache.set(cacheKey, { token: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 });
  return body.access_token;
}
