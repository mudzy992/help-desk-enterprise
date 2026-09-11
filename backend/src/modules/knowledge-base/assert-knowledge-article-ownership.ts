import { KnowledgeBaseError } from './knowledge-base.error';

export function assertKnowledgeArticleOwnership(input: {
  readonly ownerUserId: string | null;
  readonly ownerGroupId: string | null;
}): { readonly ownerUserId: string | null; readonly ownerGroupId: string | null } {
  const ownerUserId = input.ownerUserId?.trim() || null;
  const ownerGroupId = input.ownerGroupId?.trim() || null;
  const hasUser = ownerUserId !== null;
  const hasGroup = ownerGroupId !== null;
  if (hasUser === hasGroup) {
    throw new KnowledgeBaseError('OWNERSHIP_REQUIRED');
  }
  return { ownerUserId, ownerGroupId };
}
