import type { AuthenticatedHttpRequest } from '../authentication/authenticated-request';
import { readAuthenticatedPrincipal } from '../authentication/authenticated-request';
import type { CatalogMutationContext } from './service-catalog.types';

export function readCatalogMutationContext(
  request: AuthenticatedHttpRequest,
): CatalogMutationContext {
  return {
    actorUserId: readAuthenticatedPrincipal(request)?.subjectId ?? null,
  };
}
