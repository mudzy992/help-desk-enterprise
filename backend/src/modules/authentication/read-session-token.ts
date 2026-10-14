import { readBearerAccessTokenFromHeader } from './read-bearer-access-token';
import { readSessionCookie } from './session-cookie';

export type SessionTokenSource = 'bearer' | 'cookie';

export type SessionTokenCarrier = {
  readonly headers?: {
    readonly authorization?: string | string[];
    readonly cookie?: string | string[];
  };
};

export type SessionToken = {
  readonly token: string;
  readonly source: SessionTokenSource;
};

/**
 * The session cookie serves the browser app; a bearer header serves the
 * clients that cannot hold cookies (the browser extension, E2E tooling). An
 * explicit bearer header wins so those clients are never affected by a cookie
 * the browser also happens to send.
 */
export function readSessionToken(request: SessionTokenCarrier): SessionToken | null {
  const bearer = readBearerAccessTokenFromHeader(request.headers?.authorization);
  if (bearer !== null) {
    return { token: bearer, source: 'bearer' };
  }
  const cookie = readSessionCookie(request.headers?.cookie);
  return cookie === null ? null : { token: cookie, source: 'cookie' };
}
