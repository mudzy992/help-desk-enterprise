import { UnauthorizedException } from '@nestjs/common';
import {
  readAuthenticatedPrincipal,
  readSessionId,
  type AuthenticatedHttpRequest,
} from '../authentication/authenticated-request';
import type { AuthorizationPrincipal } from '../authentication/authentication.types';
import { readAuditRequestId } from '../audit-log/read-audit-request-id';

export type PrivacyActor = {
  readonly principal: AuthorizationPrincipal;
  readonly requestId: string | null;
  readonly sessionId: string | null;
};

export function privacyActorOf(request: AuthenticatedHttpRequest): PrivacyActor {
  const principal = readAuthenticatedPrincipal(request);
  if (principal === null) {
    throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Authentication failed' });
  }
  return {
    principal,
    requestId: readAuditRequestId(request.headers) ?? null,
    sessionId: readSessionId(request),
  };
}
