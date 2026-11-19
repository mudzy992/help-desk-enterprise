import { authorizationRoleKeys } from '../authorization/authorization.constants';
import {
  createTestAssignment,
  createTestAuthorizationContext,
} from '../authorization/create-test-authorization-context';
import {
  createKnowledgeBaseServiceHarness,
  knowledgeBaseTestIds,
} from './create-knowledge-base-service-harness';
import {
  isKnowledgeArticleVisibleTo,
  loadKnowledgeArticleVisibilities,
} from './load-knowledge-article-scope';
import { publishedArticleSeed } from './published-article-seed';
import type { KnowledgeArticleRecord } from './knowledge-base.types';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const { ouHr, ouIt, groupIt, serviceVpn } = knowledgeBaseTestIds;

/**
 * W7.60 (BA-search-06): `search` inherited the owner/reviewer scope bypass of
 * audit 25 because the surfaces decided visibility through different code. The
 * rule itself was fixed in W7.49/W7.50, but `/search` uses the batched loader
 * while the detail read used a second one — and two implementations of "may
 * this actor read this article" are exactly how a module re-inherits a bypass
 * nobody intended.
 *
 * Both surfaces now call one loader. This spec is the invariant: for every
 * actor and every article shape, the batched answer and the single-row answer
 * are identical, and the delegation edges of audit 25 (foreign OU, foreign
 * service, cleared reviewer, plain USER in an owner group) are denied in both.
 */
describe('Knowledge base — one visibility decision for every surface (W7.60)', () => {
  const itInternal = publishedArticleSeed({
    id: 'it-internal',
    title: 'VPN pristup',
  });
  const itOwnerDraft = publishedArticleSeed({
    id: 'it-owner-draft',
    title: 'VPN vlasnički nacrt',
    status: 'DRAFT',
    publishedAt: null,
    lastReviewedAt: null,
    ownerUserId: knowledgeBaseTestIds.ownerUser,
    reviewerUserId: null,
  });
  const itReviewerDraft = publishedArticleSeed({
    id: 'it-reviewer-draft',
    title: 'VPN recenzentski nacrt',
    status: 'DRAFT',
    publishedAt: null,
    lastReviewedAt: null,
    ownerUserId: knowledgeBaseTestIds.agentIt,
    reviewerUserId: knowledgeBaseTestIds.reviewerUser,
  });
  const itRestricted = publishedArticleSeed({
    id: 'it-restricted',
    title: 'VPN restriktivna procedura',
    classification: 'RESTRICTED',
    // Not owned by the IT agent: otherwise the delegation, not the
    // classification, would be the reason the row is readable.
    ownerUserId: knowledgeBaseTestIds.adminIt,
    reviewerUserId: knowledgeBaseTestIds.adminIt,
  });
  const hrConfidential = publishedArticleSeed({
    id: 'hr-confidential',
    title: 'VPN upitnik za upravu',
    classification: 'CONFIDENTIAL',
    organizationalUnitId: ouHr,
  });
  const hrOwnedDraft = publishedArticleSeed({
    id: 'it-owned-by-hr',
    title: 'VPN nacrt tuđeg OU',
    status: 'DRAFT',
    publishedAt: null,
    lastReviewedAt: null,
    ownerUserId: knowledgeBaseTestIds.agentHr,
    reviewerUserId: null,
  });
  const groupDraft = publishedArticleSeed({
    id: 'it-group-draft',
    title: 'VPN grupni nacrt',
    status: 'DRAFT',
    publishedAt: null,
    lastReviewedAt: null,
    ownerUserId: null,
    ownerGroupId: groupIt,
    reviewerUserId: null,
  });

  const seedAll = (
    memory: ReturnType<typeof createKnowledgeBaseServiceHarness>['memory'],
  ) => {
    for (const article of [
      itInternal,
      itOwnerDraft,
      itReviewerDraft,
      itRestricted,
      hrConfidential,
      hrOwnedDraft,
      groupDraft,
    ]) {
      memory.seedArticle(article);
    }
    // A scoped IT member and a global USER are both in the owner group: only
    // the scoped one inherits the group delegation (W7.49).
    memory.seedGroupMember({
      groupId: groupIt,
      userId: knowledgeBaseTestIds.ownerUser,
    });
    memory.seedGroupMember({
      groupId: groupIt,
      userId: knowledgeBaseTestIds.requester,
    });
  };

  const allArticles: readonly KnowledgeArticleRecord[] = [
    itInternal,
    itOwnerDraft,
    itReviewerDraft,
    itRestricted,
    hrConfidential,
    hrOwnedDraft,
    groupDraft,
  ];

  const actorIds = [
    knowledgeBaseTestIds.requester,
    knowledgeBaseTestIds.ownerUser,
    knowledgeBaseTestIds.reviewerUser,
    knowledgeBaseTestIds.agentIt,
    knowledgeBaseTestIds.agentHr,
    knowledgeBaseTestIds.adminIt,
    knowledgeBaseTestIds.superAdmin,
  ] as const;

  it('returns the same verdict per row and per batch for every actor', async () => {
    const { memory, contexts } = createKnowledgeBaseServiceHarness();
    seedAll(memory);
    // A user whose assignment sits in the article's OU but in another service.
    const payrollOwnerId = 'user-owner-payroll';
    memory.seedUser({ id: payrollOwnerId });
    contexts.set(
      payrollOwnerId,
      createTestAuthorizationContext({
        subjectId: payrollOwnerId,
        assignments: [
          createTestAssignment({
            roleKey: authorizationRoleKeys.user,
            permissionKeys: [],
            organizationalUnitId: ouIt,
            organizationalUnitPath: '/Korisnici/IT',
            serviceId: knowledgeBaseTestIds.servicePayroll,
          }),
        ],
      }),
    );
    memory.seedArticle(
      publishedArticleSeed({
        id: 'it-owned-by-payroll',
        title: 'VPN nacrt tuđeg servisa',
        status: 'DRAFT',
        publishedAt: null,
        lastReviewedAt: null,
        ownerUserId: payrollOwnerId,
        reviewerUserId: null,
        serviceId: serviceVpn,
      }),
    );

    const prisma = memory.prisma as never;
    let compared = 0;
    for (const actorId of [...actorIds, payrollOwnerId]) {
      const context = contexts.get(actorId);
      expect(context).toBeDefined();
      const batched = await loadKnowledgeArticleVisibilities(
        prisma,
        context as never,
        allArticles,
      );
      for (const article of allArticles) {
        expect({
          actorId,
          articleId: article.id,
          single: await isKnowledgeArticleVisibleTo(
            prisma,
            context as never,
            article,
          ),
        }).toEqual({
          actorId,
          articleId: article.id,
          single: batched.has(article.id),
        });
        compared += 1;
      }
    }
    // 8 actors × 7 articles: a parity check that silently compared nothing
    // would otherwise pass.
    expect(compared).toBe(56);
  });

  it('denies the delegation edges the audit named, through both surfaces', async () => {
    const { memory, contexts, articles } = createKnowledgeBaseServiceHarness();
    seedAll(memory);
    const prisma = memory.prisma as never;

    const verdict = async (actorId: string, article: KnowledgeArticleRecord) => {
      const single = await isKnowledgeArticleVisibleTo(
        prisma,
        contexts.get(actorId) as never,
        article,
      );
      const batched = await loadKnowledgeArticleVisibilities(
        prisma,
        contexts.get(actorId) as never,
        [article],
      );
      expect(batched.has(article.id)).toBe(single);
      return single;
    };

    // In scope: the delegation holds on both surfaces.
    expect(await verdict(knowledgeBaseTestIds.agentIt, itOwnerDraft)).toBe(true);
    expect(
      await verdict(knowledgeBaseTestIds.reviewerUser, itReviewerDraft),
    ).toBe(true);
    expect(await verdict(knowledgeBaseTestIds.ownerUser, groupDraft)).toBe(true);

    // Foreign OU: the owner of an IT article who is assigned to HR sees nothing.
    expect(await verdict(knowledgeBaseTestIds.agentHr, hrOwnedDraft)).toBe(false);
    // Global USER assignment is not an article scope, even as a group member.
    expect(
      await verdict(knowledgeBaseTestIds.requester, groupDraft),
    ).toBe(false);
    // Cleared reviewer: re-seeding the row without the assignment ends it.
    memory.seedArticle({ ...itReviewerDraft, reviewerUserId: null });
    expect(
      await verdict(knowledgeBaseTestIds.reviewerUser, {
        ...itReviewerDraft,
        reviewerUserId: null,
      }),
    ).toBe(false);

    // The by-id read answers exactly like the search group.
    await expect(
      articles.getById('it-owned-by-hr', {
        actorUserId: knowledgeBaseTestIds.agentHr,
      }),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    expect(
      await articles.searchTitles(
        { q: 'tuđeg OU', limit: 10 },
        { actorUserId: knowledgeBaseTestIds.agentHr },
      ),
    ).toMatchObject({ items: [] });
  });

  it('keeps classification and archive semantics identical on both surfaces', async () => {
    const { memory, contexts } = createKnowledgeBaseServiceHarness();
    seedAll(memory);
    const prisma = memory.prisma as never;
    const check = async (actorId: string, article: KnowledgeArticleRecord) => {
      const single = await isKnowledgeArticleVisibleTo(
        prisma,
        contexts.get(actorId) as never,
        article,
      );
      const batched = await loadKnowledgeArticleVisibilities(
        prisma,
        contexts.get(actorId) as never,
        [article],
      );
      expect(batched.has(article.id)).toBe(single);
      return single;
    };

    // Published INTERNAL is a company-wide product rule, not a leak: it stays
    // readable by every signed-in actor on both surfaces.
    expect(await check(knowledgeBaseTestIds.requester, itInternal)).toBe(true);
    // CONFIDENTIAL stays inside the OU scope of the article.
    expect(await check(knowledgeBaseTestIds.agentHr, hrConfidential)).toBe(true);
    expect(await check(knowledgeBaseTestIds.agentIt, hrConfidential)).toBe(false);
    // RESTRICTED stays admin-only inside the scope.
    expect(await check(knowledgeBaseTestIds.agentIt, itRestricted)).toBe(false);
    expect(await check(knowledgeBaseTestIds.adminIt, itRestricted)).toBe(true);
    // Super admin is not asked for scope on either surface.
    for (const article of allArticles) {
      expect(await check(knowledgeBaseTestIds.superAdmin, article)).toBe(true);
    }
  });
});
