import { PrismaService } from '../../common/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
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
import { assertKnowledgeCategoryAssignable } from './portal/knowledge-categories';
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

/**
 * W7.27: an optional transaction lets a caller (the problem article flow) create
 * the article inside its own transaction; the writes then join that transaction
 * instead of opening a nested one, so a failed caller rolls the draft back.
 */
export async function createKnowledgeArticle(
  prisma: PrismaService,
  loader: AuthorizationContextLoader,
  input: CreateKnowledgeArticleInput,
  context: KnowledgeArticleMutationContext,
  options: { readonly transaction?: Prisma.TransactionClient } = {},
): Promise<KnowledgeArticleRecord> {
  const client = (options.transaction ?? prisma) as unknown as PrismaService;
  const actor = await loadKnowledgeActorContext(loader, context);
  const serviceId = await assertKnowledgeServiceExists(client, input.serviceId);
  const organizationalUnitId = await assertKnowledgeOrganizationalUnitExists(
    client,
    input.organizationalUnitId,
  );
  const ownership = assertKnowledgeArticleOwnership({
    ownerUserId: input.ownerUserId ?? null,
    ownerGroupId: input.ownerGroupId ?? null,
  });
  const ownerUserId = await assertKnowledgeUserExists(
    client,
    ownership.ownerUserId,
    'OWNER_USER_NOT_FOUND',
  );
  const ownerGroupId = await assertKnowledgeGroupExists(
    client,
    ownership.ownerGroupId,
  );
  const reviewerUserId = await assertKnowledgeUserExists(
    client,
    input.reviewerUserId?.trim() || null,
    'REVIEWER_NOT_FOUND',
  );
  const categoryId = await assertKnowledgeCategoryAssignable(
    client,
    input.categoryId,
  );
  const title = normalizeKnowledgeArticleTitle(input.title);
  const body = normalizeKnowledgeArticleBody(input.body);
  const scope = await loadKnowledgeArticleScope(client, {
    organizationalUnitId,
    serviceId,
  });
  assertCanCreateKnowledgeArticle({ context: actor, scope });
  const slug = await allocateKnowledgeArticleSlug(
    async (candidate) =>
      (await client.knowledgeArticle.findUnique({
        where: { slug: candidate },
        select: { id: true },
      })) !== null,
    title,
  );
  const write = async (transaction: PrismaService) => {
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
        categoryId,
        // Set only by the portal "article from reply" flow (validated there).
        sourceTicketId: input.sourceTicketId ?? null,
        sourceMessageId: input.sourceMessageId ?? null,
      },
    });
    const record = toArticleRecord(article);
    await recordKnowledgeArticleChange(transaction, {
      action: changeLogActions.create,
      reason: input.reason,
      before: null,
      after: record,
      actorUserId: context.actorUserId,
    });
    return record;
  };
  // A caller-provided transaction must not be nested: its writes join the caller.
  if (options.transaction !== undefined) return write(client);
  return prisma.$transaction((transaction) => write(transaction as unknown as PrismaService));
}
