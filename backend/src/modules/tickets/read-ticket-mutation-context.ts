import { ForbiddenException } from '@nestjs/common';
import {
  readAuthenticatedPrincipal,
  type AuthenticatedHttpRequest,
} from '../authentication/authenticated-request';
import type { TicketMutationContext } from './tickets.types';

/**
 * Reads the acting user off the authenticated request for the ticket routes.
 *
 * The three ticket controllers used to carry their own copy of this; the search
 * endpoint needs the same context, so it lives here now.
 */
export function readTicketMutationContext(
  request: AuthenticatedHttpRequest,
): TicketMutationContext {
  const actorUserId = readAuthenticatedPrincipal(request)?.subjectId ?? '';
  if (actorUserId.length === 0) {
    throw new ForbiddenException({
      code: 'FORBIDDEN',
      message: 'Authorization failed',
    });
  }
  return { actorUserId };
}
