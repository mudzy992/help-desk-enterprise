import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedHttpRequest } from '../authentication/authenticated-request';
import { readAuthenticatedPrincipal } from '../authentication/authenticated-request';
import type { KnowledgeArticleMutationContext } from './knowledge-base.types';

export function readKnowledgeMutationContext(
  request: AuthenticatedHttpRequest,
): KnowledgeArticleMutationContext {
  const actorUserId = readAuthenticatedPrincipal(request)?.subjectId ?? '';
  if (actorUserId.length === 0) {
    throw new ForbiddenException({
      code: 'FORBIDDEN',
      message: 'Authorization failed',
    });
  }
  return { actorUserId };
}
