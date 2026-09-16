import type { AuthenticatedHttpRequest } from './authenticated-request';

export function readBearerAccessToken(
  request: AuthenticatedHttpRequest,
): string | null {
  return readBearerAccessTokenFromHeader(request.headers?.authorization);
}

export function readBearerAccessTokenFromHeader(
  header: string | string[] | undefined,
): string | null {
  const value = Array.isArray(header) ? header[0] : header;
  if (typeof value !== 'string') {
    return null;
  }
  const match = /^Bearer\s+(\S+)$/i.exec(value.trim());
  if (match === null) {
    return null;
  }
  const accessToken = match[1];
  if (accessToken === undefined || accessToken.length === 0) {
    return null;
  }
  return accessToken;
}
