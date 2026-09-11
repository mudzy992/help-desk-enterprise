import type { AuthenticatedHttpRequest } from '../authentication/authenticated-request';
import { readAuthenticatedPrincipal } from '../authentication/authenticated-request';
import type { SlaMutationContext } from './sla.types';

export function readSlaMutationContext(
  request: AuthenticatedHttpRequest,
): SlaMutationContext {
  return {
    actorUserId: readAuthenticatedPrincipal(request)?.subjectId ?? null,
  };
}
