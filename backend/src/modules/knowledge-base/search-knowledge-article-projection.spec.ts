import { permissionKeys } from '../authorization/authorization.constants';
import type { AuthorizationContext } from '../authorization/authorization.types';
import {
  canReadKnowledgeArticle,
  type KnowledgeArticleAccessScope,
} from './can-read-knowledge-article';
import {
  createKnowledgeBaseServiceHarness,
  knowledgeBaseTestIds,
} from './create-knowledge-base-service-harness';
import type { KnowledgeArticleRecord } from './knowledge-base.types';
import { loadKnowledgeArticleVisibilities } from './load-knowledge-article-scope';
import { publishedArticleSeed } from './published-article-seed';
import {
  knowledgeArticleTitleSearchSelect,
  type KnowledgeArticleTitleSearchRow,
} from './search-knowledge-article-projection';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const { requester, agentIt, agentHr, adminIt, superAdmin, ownerUser, reviewerUser } =
  knowledgeBaseTestIds;

const ouPaths: Record<string, string> = {
  [knowledgeBaseTestIds.ouIt]: '/Korisnici/IT',
  [knowledgeBaseTestIds.ouHr]: '/Korisnici/HR',
};

/** Applies the same `select` the query sends, exactly like Prisma would. */
function project(article: KnowledgeArticleRecord): KnowledgeArticleTitleSearchRow {
  const projected: Record<string, unknown> = {};
  for (const column of Object.keys(knowledgeArticleTitleSearchSelect)) {
    projected[column] = article[column as keyof KnowledgeArticleRecord];
  }
  return projected as unknown as KnowledgeArticleTitleSearchRow;
}

function scopeOf(article: KnowledgeArticleRecord): KnowledgeArticleAccessScope {
  return {
    organizationalUnitId: article.organizationalUnitId,
    organizationalUnitPath: ouPaths[article.organizationalUnitId] ?? '/Korisnici',
    serviceId: article.serviceId,
  };
}

function decide(
  actor: AuthorizationContext,
  article: KnowledgeArticleRecord | KnowledgeArticleTitleSearchRow,
): boolean {
  return canReadKnowledgeArticle({
    context: actor,
    article,
    scope: scopeOf(article as KnowledgeArticleRecord),
    ownerGroupMemberUserIds: new Set<string>(),
    writePermissionKey: permissionKeys.knowledgeArticleWrite,
    reviewPermissionKey: permissionKeys.knowledgeArticleReview,
    publishPermissionKey: permissionKeys.knowledgeArticlePublish,
  });
}

/**
 * W7.58 (BA-search-04): the `/search` title read must not load article text
 * before the authorization decision. These specs pin the two halves of that
 * claim: the projection is *minimal* (no content columns) and it is *sufficient*
 * (the predicate takes exactly the same decisions it takes on a full record).
 */
describe('Knowledge base — search visibility projection (W7.58)', () => {
  it('selects only the output, visibility and keyset columns', () => {
    const columns = Object.keys(knowledgeArticleTitleSearchSelect).sort();
    expect(columns).toEqual(
      [
        'classification',
        'id',
        'organizationalUnitId',
        'ownerGroupId',
        'ownerUserId',
        'reviewerUserId',
        'serviceId',
        'slug',
        'status',
        'title',
        'updatedAt',
      ].sort(),
    );
    // The content columns are the point of the finding: they must not be read.
    for (const contentColumn of [
      'body',
      'categoryId',
      'isFaq',
      'faqOrder',
      'ratingCount',
      'ratingSum',
      'viewCount',
      'sourceTicketId',
      'sourceMessageId',
    ]) {
      expect(knowledgeArticleTitleSearchSelect).not.toHaveProperty(contentColumn);
    }
  });

  it('decides exactly like the full record does, for every actor and classification', () => {
    const articles: readonly KnowledgeArticleRecord[] = [
      publishedArticleSeed({ id: 'internal-it', slug: 'internal-it' }),
      publishedArticleSeed({
        id: 'confidential-it',
        slug: 'confidential-it',
        classification: 'CONFIDENTIAL',
      }),
      publishedArticleSeed({
        id: 'restricted-it',
        slug: 'restricted-it',
        classification: 'RESTRICTED',
      }),
      publishedArticleSeed({ id: 'draft-it', slug: 'draft-it', status: 'DRAFT' }),
      publishedArticleSeed({
        id: 'confidential-hr',
        slug: 'confidential-hr',
        classification: 'CONFIDENTIAL',
        organizationalUnitId: knowledgeBaseTestIds.ouHr,
        serviceId: knowledgeBaseTestIds.servicePayroll,
      }),
      publishedArticleSeed({
        id: 'owned-by-owner',
        slug: 'owned-by-owner',
        ownerUserId: ownerUser,
        classification: 'CONFIDENTIAL',
      }),
      publishedArticleSeed({
        id: 'reviewed-by-reviewer',
        slug: 'reviewed-by-reviewer',
        reviewerUserId: reviewerUser,
        classification: 'CONFIDENTIAL',
      }),
    ];
    const { contexts } = createKnowledgeBaseServiceHarness();
    const actors = [requester, agentIt, agentHr, adminIt, superAdmin, ownerUser, reviewerUser];

    for (const subjectId of actors) {
      const actor = contexts.get(subjectId);
      expect(actor).toBeDefined();
      if (actor === undefined) {
        continue;
      }
      for (const article of articles) {
        // The projection drops `body` and the rest of the row; if the predicate
        // needed anything outside it, the two answers would diverge here.
        expect({ id: article.id, allowed: decide(actor, project(article)) }).toEqual({
          id: article.id,
          allowed: decide(actor, article),
        });
      }
    }
  });

  it('answers the batch visibility check identically for projected rows', async () => {
    const { memory, contexts } = createKnowledgeBaseServiceHarness();
    const records = [
      publishedArticleSeed({ id: 'kb-1', slug: 'kb-1' }),
      publishedArticleSeed({
        id: 'kb-2',
        slug: 'kb-2',
        classification: 'CONFIDENTIAL',
      }),
      publishedArticleSeed({
        id: 'kb-3',
        slug: 'kb-3',
        classification: 'CONFIDENTIAL',
        organizationalUnitId: knowledgeBaseTestIds.ouHr,
        serviceId: knowledgeBaseTestIds.servicePayroll,
      }),
      publishedArticleSeed({
        id: 'kb-4',
        slug: 'kb-4',
        status: 'DRAFT',
        classification: 'CONFIDENTIAL',
      }),
    ];
    for (const record of records) {
      memory.seedArticle(record);
    }

    for (const subjectId of [requester, agentIt, agentHr, adminIt, superAdmin]) {
      const actor = contexts.get(subjectId);
      expect(actor).toBeDefined();
      if (actor === undefined) {
        continue;
      }
      const full = await loadKnowledgeArticleVisibilities(memory.prisma as never, actor, records);
      const projected = await loadKnowledgeArticleVisibilities(
        memory.prisma as never,
        actor,
        records.map(project),
      );
      expect([...projected].sort()).toEqual([...full].sort());
    }
  });

  it('keeps the content out of the read even when the actor may read the article', () => {
    const article = publishedArticleSeed({
      id: 'readable',
      slug: 'readable',
      body: 'CANARY-BODY-7b1d',
    });
    const row = project(article);

    // The row cannot carry the text by construction — there is no column for it.
    expect(Object.keys(row).sort()).not.toContain('body');
    expect(JSON.stringify(row)).not.toContain('CANARY-BODY-7b1d');
    // …and the decision still allows the article, so nothing is hidden by the
    // narrower read.
    const { contexts } = createKnowledgeBaseServiceHarness();
    const actor = contexts.get(agentIt);
    expect(actor).toBeDefined();
    if (actor !== undefined) {
      expect(decide(actor, row)).toBe(true);
    }
  });
});
