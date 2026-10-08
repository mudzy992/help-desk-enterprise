import { expect, test } from '@playwright/test';
import { ApiClient } from '../helpers/api-client';
import { readE2EEnvironment } from '../helpers/environment';
import { nextTotpCode } from '../helpers/mfa';

/**
 * Paket 5.2.4 M2 (NISKO): end-to-end login → MFA → session → authorized call.
 *
 * Dizajnerska napomena: backend vraća Bearer JWT u JSON odgovoru (NE `sid`
 * HttpOnly cookie) i `/auth/*` rute primaju token kroz `Authorization: Bearer
 * <token>` header. `sid` je claim *unutar* JWT-a koji povezuje sve refresheve
 * s istim retkom u session registry — za ovaj dizajn nema cookie atributa
 * (HttpOnly/Secure/SameSite) za provjeriti; umjesto toga assertamo da:
 *   1. `/auth/security` vraća 401 bez tokena;
 *   2. `POST /auth/login` (tačna šifra, prije MFA) NE izdaje session token;
 *   3. Ispravan MFA verify izdaje JWT koji je sintaksno ispravan i sadrži
 *      `sub`, `sid`, `jti`, `exp` claimove (bez `purpose` — koji rezervira
 *      password-change tokene);
 *   4. Poziv s novim tokenom na `/auth/security` prolazi (200) i vraća
 *      podatke prijavljenog korisnika;
 *   5. Nakon `/auth/logout` taj isti token postaje nevažeći.
 */
function decodeJwtPayload(accessToken: string): {
  readonly sub?: unknown;
  readonly sid?: unknown;
  readonly jti?: unknown;
  readonly exp?: unknown;
  readonly iat?: unknown;
  readonly purpose?: unknown;
  readonly [key: string]: unknown;
} {
  const parts = accessToken.split('.');
  if (parts.length !== 3) throw new Error('Expected a three-part JWT.');
  const payload = parts[1];
  if (payload === undefined) throw new Error('JWT payload segment missing.');
  const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as {
    readonly sub?: unknown;
    readonly sid?: unknown;
    readonly jti?: unknown;
    readonly exp?: unknown;
    readonly iat?: unknown;
    readonly purpose?: unknown;
  };
}

test.describe('39 login → MFA → session flow integrity (5.2.4 M2)', () => {
  test('full local login with enforced MFA issues a valid session JWT and protects /auth/security', async () => {
    const env = readE2EEnvironment();
    const api = new ApiClient();

    // 1. Bez tokena /auth/security nije dostupan.
    const anonymous = await api.request('/auth/security');
    expect(anonymous.status).toBe(401);

    // 2. Login sa ispravnom šifrom: ne smije izdati token, samo MFA izazov.
    const pending = await api.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: env.superAdminEmail, password: env.superAdminPassword }),
    });
    expect(pending.status).toBe(200);
    const pendingBody = (await pending.json()) as {
      readonly status?: string;
      readonly mfaToken?: string;
      readonly accessToken?: unknown;
      readonly token?: unknown;
    };
    expect(pendingBody.status).toBe('MFA_REQUIRED');
    expect(typeof pendingBody.mfaToken).toBe('string');
    expect(pendingBody.accessToken).toBeUndefined();
    expect(pendingBody.token).toBeUndefined();

    // 3. Krivi MFA kod je odbijen.
    const badMfa = await api.request('/auth/mfa/verify', {
      method: 'POST',
      body: JSON.stringify({ mfaToken: pendingBody.mfaToken, code: '000000' }),
    });
    expect(badMfa.status).toBe(401);

    // 4. Ispravan MFA kod izdaje JWT sa očekivanim claimovima.
    const mfaToken = pendingBody.mfaToken;
    if (mfaToken === undefined) throw new Error('mfaToken missing after login');
    const verified = await api.request('/auth/mfa/verify', {
      method: 'POST',
      body: JSON.stringify({ mfaToken, code: await nextTotpCode(env.superAdminEmail) }),
    });
    expect(verified.status).toBe(200);
    const session = (await verified.json()) as { readonly accessToken: string };
    expect(typeof session.accessToken).toBe('string');
    expect(session.accessToken.length).toBeGreaterThan(20);

    const claims = decodeJwtPayload(session.accessToken);
    expect(typeof claims.sub).toBe('string');
    expect(typeof claims.sid).toBe('string');
    expect(typeof claims.jti).toBe('string');
    expect(typeof claims.exp).toBe('number');
    expect(claims.purpose).toBeUndefined();
    // Token važi otprilike 60 min (±5 min tolerancije na izvršenje testa).
    const ttlSeconds = Number(claims.exp) - Math.floor(Date.now() / 1000);
    expect(ttlSeconds).toBeGreaterThan(55 * 60);
    expect(ttlSeconds).toBeLessThanOrEqual(60 * 60);

    // 5. Novi token autorizira /auth/security.
    const authedClient = new ApiClient();
    authedClient.setBearerToken(session.accessToken);
    const security = await authedClient.requestJson<{
      readonly principal: { readonly email: string };
    }>('/auth/security');
    expect(security.principal.email.toLowerCase()).toBe(env.superAdminEmail.toLowerCase());

    // 6. Nakon logout-a token je odbijen (revokacija u registry/storu).
    const logout = await authedClient.request('/auth/logout', { method: 'POST' });
    expect(logout.status).toBe(204);
    const afterLogout = await authedClient.request('/auth/security');
    expect(afterLogout.status).toBe(401);
  });
});
