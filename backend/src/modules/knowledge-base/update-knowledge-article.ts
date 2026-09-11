import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { assertCanWriteKnowledgeArticle } from './assert-knowledge-article-mutation';
import { assertKnowledgeArticleOwnership } from './assert-knowledge-article-ownership';
import { assertKnowledgeLifecycleTransition } from './assert-knowledge-lifecycle-transition';
import {
  assertKnowledgeGroupExists,
  assertKnowledgeUserExists,
} from './assert-knowledge-references';
import { loadKnowledgeActorContext } from './load-knowledge-actor-context';
import {
  loadKnowledgeArticleRecord,
  toArticleRecord,
} from './load-knowledge-article';
import {
  loadKnowledgeArticleScope,
  loadOwnerGroupMemberUserIds,
} from './load-knowledge-article-scope';
import {
  normalizeKnowledgeArticleBody,
  normalizeKnowledgeArticleTitle,
} from './normalize-knowledge-article-text';
import {
  changeLogActions,
  recordKnowledgeArticleChange,
} from './record-knowledge-article-change';
import type {
  KnowledgeArticleMutationContext,
  KnowledgeArticleRecord,
  UpdateKnowledgeArticleInput,
} from './knowledge-base.types';

export async function updateKnowledgeArticle(
  prisma: PrismaService,
  loader: AuthorizationContextLoader,
  articleId: string,
  input: UpdateKnowledgeArticleInput,
  context: KnowledgeArticleMutationContext,
): Promise<KnowledgeArticleRecord> {
  const actor = await loadKnowledgeActorContext(loader, context);
  const current = await loadKnowledgeArticleRecord(prisma, articleId);
  const scope = await loadKnowledgeArticleScope(prisma, current);
  const ownerGroupMemberUserIds = await loadOwnerGroupMemberUserIds(
    prisma,
    current.ownerGroupId,
  );
  assertCanWriteKnowledgeArticle({
    context: actor,
    article: current,
    scope,
    ownerGroupMemberUserIds,
  });
  const nextTitle =
    input.title === undefined
      ? current.title
      : normalizeKnowledgeArticleTitle(input.title);
  const nextBody =
    input.body === undefined
      ? current.body
      : normalizeKnowledgeArticleBody(input.body);
  const ownership = resolveOwnership(current, input);
  const ownerUserId = await assertKnowledgeUserExists(
    prisma,
    ownership.ownerUserId,
    'OWNER_USER_NOT_FOUND',
  );
  const ownerGroupId = await assertKnowledgeGroupExists(
    prisma,
    ownership.ownerGroupId,
  );
  const reviewerUserId =
    input.reviewerUserId === undefined
      ? current.reviewerUserId
      : await assertKnowledgeUserExists(
          prisma,
          input.reviewerUserId,
          'REVIEWER_NOT_FOUND',
        );
  const contentChanged = nextTitle !== current.title || nextBody !== current.body;
  const nextStatus = nextStatusAfterContentEdit(current, contentChanged);
  if (nextStatus !== current.status) {
    assertKnowledgeLifecycleTransition(current.status, nextStatus);
  }
  return prisma.$transaction(async (transaction) => {
    const updated = await transaction.knowledgeArticle.update({
      where: { id: current.id },
      data: {
        title: nextTitle,
        body: nextBody,
        ownerUserId,
        ownerGroupId,
        reviewerUserId,
        classification: input.classification ?? current.classification,
        status: nextStatus,
        lastReviewedAt:
          contentChanged && current.status === 'PUBLISHED'
            ? null
            : current.lastReviewedAt,
      },
    });
    const record = toArticleRecord(updated);
    await recordKnowledgeArticleChange(transaction as PrismaService, {
      action: changeLogActions.update,
      reason: input.reason,
      before: current,
      after: record,
      actorUserId: context.actorUserId,
    });
    return record;
  });
}

function resolveOwnership(
  current: KnowledgeArticleRecord,
  input: UpdateKnowledgeArticleInput,
) {
  return assertKnowledgeArticleOwnership({
    ownerUserId:
      input.ownerUserId === undefined ? current.ownerUserId : input.ownerUserId,
    ownerGroupId:
      input.ownerGroupId === undefined ? current.ownerGroupId : input.ownerGroupId,
  });
}

function nextStatusAfterContentEdit(
  current: KnowledgeArticleRecord,
  contentChanged: boolean,
): KnowledgeArticleRecord['status'] {
  if (!contentChanged || current.status !== 'PUBLISHED') {
    return current.status;
  }
  return current.reviewerUserId === null ? 'DRAFT' : 'IN_REVIEW';
}
