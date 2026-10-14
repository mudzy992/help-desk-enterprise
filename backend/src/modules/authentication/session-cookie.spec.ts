import {
  SESSION_COOKIE_NAME,
  buildClearedSessionCookie,
  buildSessionCookie,
  readSessionCookie,
} from './session-cookie';
import { readSessionToken } from './read-session-token';

const SYNTHETIC_TOKEN = 'synthetic-session-token-test-only';

describe('session cookie', () => {
  it('reads the session value among other cookies', () => {
    expect(
      readSessionCookie(`theme=dark; ${SESSION_COOKIE_NAME}=${SYNTHETIC_TOKEN}; lang=bs`),
    ).toBe(SYNTHETIC_TOKEN);
  });

  it('ignores cookies whose name only starts with the session name', () => {
    expect(readSessionCookie(`${SESSION_COOKIE_NAME}_old=${SYNTHETIC_TOKEN}`)).toBeNull();
  });

  it('returns null for a missing or empty session value', () => {
    expect(readSessionCookie(undefined)).toBeNull();
    expect(readSessionCookie(`${SESSION_COOKIE_NAME}=`)).toBeNull();
  });

  it('builds an HttpOnly, strict cookie with the session lifetime', () => {
    expect(buildSessionCookie(SYNTHETIC_TOKEN, 3600)).toBe(
      `${SESSION_COOKIE_NAME}=${SYNTHETIC_TOKEN}; Path=/; Max-Age=3600; HttpOnly; Secure; SameSite=Strict`,
    );
  });

  it('builds a cookie that expires the session on sign-out', () => {
    const cleared = buildClearedSessionCookie();
    expect(cleared.startsWith(`${SESSION_COOKIE_NAME}=;`)).toBe(true);
    expect(cleared).toContain('Max-Age=0');
    expect(cleared).toContain('HttpOnly');
  });
});

describe('readSessionToken', () => {
  it('prefers an explicit bearer header over the cookie', () => {
    expect(
      readSessionToken({
        headers: {
          authorization: `Bearer ${SYNTHETIC_TOKEN}-bearer`,
          cookie: `${SESSION_COOKIE_NAME}=${SYNTHETIC_TOKEN}`,
        },
      }),
    ).toEqual({ token: `${SYNTHETIC_TOKEN}-bearer`, source: 'bearer' });
  });

  it('falls back to the session cookie when no bearer header is sent', () => {
    expect(
      readSessionToken({
        headers: { cookie: `${SESSION_COOKIE_NAME}=${SYNTHETIC_TOKEN}` },
      }),
    ).toEqual({ token: SYNTHETIC_TOKEN, source: 'cookie' });
  });

  it('returns null when neither credential is present', () => {
    expect(readSessionToken({ headers: {} })).toBeNull();
  });
});
