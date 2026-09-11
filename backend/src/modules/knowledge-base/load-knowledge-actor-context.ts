import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { KnowledgeBaseError } from './knowledge-base.error';
import type { KnowledgeArticleMutationContext } from './knowledge-base.types';

export async function loadKnowledgeActorContext(
  loader: AuthorizationContextLoader,
  context: KnowledgeArticleMutationContext,
): Promise<AuthorizationContext> {
  const authorization = await loader.loadBySubjectId(context.actorUserId);
  if (authorization === null) {
    throw new KnowledgeBaseError('FORBIDDEN');
  }
  return authorization;
}
