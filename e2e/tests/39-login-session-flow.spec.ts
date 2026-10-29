import { expect, test } from '@playwright/test';
import { ApiClient } from '../helpers/api-client';
import { readE2EEnvironment } from '../helpers/environment';
import { nextTotpCode } from '../helpers/mfa';

/**
 * Paket 5.2.4 M2 (NISKO): end-to-end login → MFA → session → authorized call.
 *
 * Browser sessions travel in an HttpOnly cookie that the API sets on the MFA
 * verify response; the JSON body carries no token. The browser extension is the
 * only client that receives a bearer token, from its own endpoint. This spec
 * asserts:
 *   1. `/auth/security` returns 401 without a session;
 *   2. `POST /auth/login` (correct password, before MFA) issues no session;
 *   3. a wrong MFA code is rejected;
 *   4. a correct MFA code sets the session cookie (HttpOnly, SameSite=Strict)
 *      whose JWT carries `sub`, `sid`, `jti`, `exp` and a ~60 min lifetime, and
 *      the body carries no token;
 *   5. the cookie authorizes `/auth/security` and `/auth/logout` revokes it;
 *   6. the extension endpoint returns a bearer token in the body and no cookie.
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

function readSessionCookieAttributes(response: Response): {
  readonly value: string;
  readonly attributes: readonly string[];
} {
  const entry = response.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith('helpdesk_session='));
  if (entry === undefined) throw new Error('Response did not set the session cookie.');
  const [pair = '', ...attributes] = entry.split(';').map((part) => part.trim());
  return { value: pair.slice('helpdesk_session='.length), attributes };
}

test.describe('39 login → MFA → session flow integrity (5.2.4 M2)', () => {
  test('full local login with enforced MFA issues an HttpOnly session cookie and protects /auth/security', async () => {
    const env = readE2EEnvironment();
    const api = new ApiClient();

    // 1. Bez sesije /auth/security nije dostupan.
    const anonymous = await api.request('/auth/security');
    expect(anonymous.status).toBe(401);

    // 2. Login sa ispravnom šifrom: ne smije izdati sesiju, samo MFA izazov.
    const pending = await api.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: env.superAdminEmail,
        password: env.superAdminPassword,
      }),
    });
    expect(pending.status).toBe(200);
    expect(
      pending.headers.getSetCookie().some((cookie) => cookie.startsWith('helpdesk_session=')),
    ).toBe(false);
    const pendingBody = (await pending.json()) as {
      readonly status?: string;
      readonly mfaToken?: string;
      readonly accessToken?: unknown;
    };
    expect(pendingBody.status).toBe('MFA_REQUIRED');
    expect(typeof pendingBody.mfaToken).toBe('string');
    expect(pendingBody.accessToken).toBeUndefined();

    // 3. Krivi MFA kod je odbijen.
    const badMfa = await api.request('/auth/mfa/verify', {
      method: 'POST',
      body: JSON.stringify({ mfaToken: pendingBody.mfaToken, code: '000000' }),
    });
    expect(badMfa.status).toBe(401);

    // 4. Ispravan MFA kod postavlja sesijski kolačić sa očekivanim claimovima.
    const mfaToken = pendingBody.mfaToken;
    if (mfaToken === undefined) throw new Error('mfaToken missing after login');
    const verified = await api.request('/auth/mfa/verify', {
      method: 'POST',
      body: JSON.stringify({
        mfaToken,
        code: await nextTotpCode(env.superAdminEmail),
      }),
    });
    expect(verified.status).toBe(200);
    const verifiedBody = (await verified.json()) as {
      readonly accessToken?: unknown;
    };
    expect(verifiedBody.accessToken).toBeUndefined();

    const { value: sessionToken, attributes } = readSessionCookieAttributes(verified);
    expect(attributes).toEqual(
      expect.arrayContaining(['Path=/', 'HttpOnly', 'Secure', 'SameSite=Strict']),
    );
    expect(sessionToken.length).toBeGreaterThan(20);

    const claims = decodeJwtPayload(sessionToken);
    expect(typeof claims.sub).toBe('string');
    expect(typeof claims.sid).toBe('string');
    expect(typeof claims.jti).toBe('string');
    expect(typeof claims.exp).toBe('number');
    expect(claims.purpose).toBeUndefined();
    // Token važi otprilike 60 min (±5 min tolerancije na izvršenje testa).
    const ttlSeconds = Number(claims.exp) - Math.floor(Date.now() / 1000);
    expect(ttlSeconds).toBeGreaterThan(55 * 60);
    expect(ttlSeconds).toBeLessThanOrEqual(60 * 60);

    // 5. Kolačić (kojeg ApiClient ponovo šalje) autorizira /auth/security.
    const security = await api.requestJson<{
      readonly principal: { readonly email: string };
    }>('/auth/security');
    expect(security.principal.email.toLowerCase()).toBe(env.superAdminEmail.toLowerCase());

    // 6. Nakon logout-a isti kolačić više ne važi (revokacija u registry/storu).
    const logout = await api.request('/auth/logout', { method: 'POST' });
    expect(logout.status).toBe(204);
    const replayed = await api.request('/auth/security', {
      headers: { Cookie: `helpdesk_session=${sessionToken}` },
    });
    expect(replayed.status).toBe(401);
  });

  test('the extension endpoint returns a bearer token in the body and sets no cookie', async () => {
    const env = readE2EEnvironment();
    const extension = new ApiClient();
    const pending = await extension.requestJson<{
      readonly mfaToken?: string;
      readonly status?: string;
    }>('/auth/extension/login', {
      method: 'POST',
      body: JSON.stringify({
        email: env.superAdminEmail,
        password: env.superAdminPassword,
      }),
    });
    if (pending.status !== 'MFA_REQUIRED' || pending.mfaToken === undefined) {
      throw new Error('Expected an MFA step for the extension sign-in.');
    }
    const verified = await extension.request('/auth/extension/mfa/verify', {
      method: 'POST',
      body: JSON.stringify({
        mfaToken: pending.mfaToken,
        code: await nextTotpCode(env.superAdminEmail),
      }),
    });
    expect(verified.status).toBe(200);
    const body = (await verified.json()) as { readonly accessToken?: string };
    expect(typeof body.accessToken).toBe('string');
    expect(body.accessToken!.length).toBeGreaterThan(10);
    expect(
      verified.headers.getSetCookie().some((cookie) => cookie.startsWith('helpdesk_session=')),
    ).toBe(false);
  });
});
