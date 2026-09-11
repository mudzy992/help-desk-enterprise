import type { AuthenticatedHttpRequest } from '../authentication/authenticated-request';
import { readAuthenticatedPrincipal } from '../authentication/authenticated-request';

export function readSettingsActorUserId(
  request: AuthenticatedHttpRequest,
): string | null {
  return readAuthenticatedPrincipal(request)?.subjectId ?? null;
}
