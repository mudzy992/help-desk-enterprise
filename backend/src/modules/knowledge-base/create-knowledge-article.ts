import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { assertCanCreateKnowledgeArticle } from './assert-knowledge-article-mutation';
import { assertKnowledgeArticleOwnership } from './assert-knowledge-article-ownership';
import {
  assertKnowledgeGroupExists,
  assertKnowledgeOrganizationalUnitExists,
  assertKnowledgeServiceExists,
  assertKnowledgeUserExists,
} from './assert-knowledge-references';
import { loadKnowledgeActorContext } from './load-knowledge-actor-context';
import { loadKnowledgeArticleScope } from './load-knowledge-article-scope';
import { toArticleRecord } from './load-knowledge-article';
import { allocateKnowledgeArticleSlug } from './normalize-knowledge-article-slug';
import {
  normalizeKnowledgeArticleBody,
  normalizeKnowledgeArticleTitle,
} from './normalize-knowledge-article-text';
import {
  changeLogActions,
  recordKnowledgeArticleChange,
} from './record-knowledge-article-change';
import type {
  CreateKnowledgeArticleInput,
  KnowledgeArticleMutationContext,
  KnowledgeArticleRecord,
} from './knowledge-base.types';

export async function createKnowledgeArticle(
  prisma: PrismaService,
  loader: AuthorizationContextLoader,
  input: CreateKnowledgeArticleInput,
  context: KnowledgeArticleMutationContext,
): Promise<KnowledgeArticleRecord> {
  const actor = await loadKnowledgeActorContext(loader, context);
  const serviceId = await assertKnowledgeServiceExists(prisma, input.serviceId);
  const organizationalUnitId = await assertKnowledgeOrganizationalUnitExists(
    prisma,
    input.organizationalUnitId,
  );
  const ownership = assertKnowledgeArticleOwnership({
    ownerUserId: input.ownerUserId ?? null,
    ownerGroupId: input.ownerGroupId ?? null,
  });
  const ownerUserId = await assertKnowledgeUserExists(
    prisma,
    ownership.ownerUserId,
    'OWNER_USER_NOT_FOUND',
  );
  const ownerGroupId = await assertKnowledgeGroupExists(
    prisma,
    ownership.ownerGroupId,
  );
  const reviewerUserId = await assertKnowledgeUserExists(
    prisma,
    input.reviewerUserId?.trim() || null,
    'REVIEWER_NOT_FOUND',
  );
  const title = normalizeKnowledgeArticleTitle(input.title);
  const body = normalizeKnowledgeArticleBody(input.body);
  const scope = await loadKnowledgeArticleScope(prisma, {
    organizationalUnitId,
    serviceId,
  });
  assertCanCreateKnowledgeArticle({ context: actor, scope });
  const slug = await allocateKnowledgeArticleSlug(
    async (candidate) =>
      (await prisma.knowledgeArticle.findUnique({
        where: { slug: candidate },
        select: { id: true },
      })) !== null,
    title,
  );
  const created = await prisma.$transaction(async (transaction) => {
    const article = await transaction.knowledgeArticle.create({
      data: {
        slug,
        title,
        body,
        status: 'DRAFT',
        classification: input.classification ?? 'INTERNAL',
        ownerUserId,
        ownerGroupId,
        reviewerUserId,
        serviceId,
        organizationalUnitId,
      },
    });
    const record = toArticleRecord(article);
    await recordKnowledgeArticleChange(transaction as PrismaService, {
      action: changeLogActions.create,
      reason: input.reason,
      before: null,
      after: record,
      actorUserId: context.actorUserId,
    });
    return record;
  });
  return created;
}
