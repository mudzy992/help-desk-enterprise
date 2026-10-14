export const SESSION_COOKIE_NAME = 'helpdesk_session';

const EXPIRED_COOKIE_DATE = 'Thu, 01 Jan 1970 00:00:00 GMT';

/**
 * Reads the session cookie from a raw `Cookie` header. Browsers never expose
 * the value to scripts (HttpOnly), so this is the only way the API sees it.
 */
export function readSessionCookie(header: string | string[] | undefined): string | null {
  const raw = Array.isArray(header) ? header.join(';') : header;
  if (typeof raw !== 'string') {
    return null;
  }
  for (const pair of raw.split(';')) {
    const separator = pair.indexOf('=');
    if (separator < 0 || pair.slice(0, separator).trim() !== SESSION_COOKIE_NAME) {
      continue;
    }
    const value = pair.slice(separator + 1).trim();
    return value.length > 0 ? value : null;
  }
  return null;
}

export function buildSessionCookie(accessToken: string, maxAgeSeconds: number): string {
  return [
    `${SESSION_COOKIE_NAME}=${accessToken}`,
    'Path=/',
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
  ].join('; ');
}

export function buildClearedSessionCookie(): string {
  return [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'Max-Age=0',
    `Expires=${EXPIRED_COOKIE_DATE}`,
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
  ].join('; ');
}

/** The part of the HTTP response the cookie helpers touch (no Express types in this project). */
export type CookieResponse = {
  setHeader(name: string, value: string): void;
};
