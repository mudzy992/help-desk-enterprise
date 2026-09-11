import type { KnowledgeArticleStatus } from '../../generated/prisma/enums';
import { allowedKnowledgeArticleStatusTransitions } from './knowledge-base.constants';
import { KnowledgeBaseError } from './knowledge-base.error';

export function assertKnowledgeLifecycleTransition(
  current: KnowledgeArticleStatus,
  next: KnowledgeArticleStatus,
): void {
  if (current === next) {
    return;
  }
  if (!allowedKnowledgeArticleStatusTransitions[current].includes(next)) {
    throw new KnowledgeBaseError('INVALID_STATUS_TRANSITION');
  }
}
