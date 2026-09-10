import type { AuthenticatedHttpRequest } from './authenticated-request';

export function readBearerAccessToken(
  request: AuthenticatedHttpRequest,
): string | null {
  const header = request.headers?.authorization;
  if (typeof header !== 'string') {
    return null;
  }
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (match === null) {
    return null;
  }
  const accessToken = match[1];
  if (accessToken === undefined || accessToken.length === 0) {
    return null;
  }
  return accessToken;
}
