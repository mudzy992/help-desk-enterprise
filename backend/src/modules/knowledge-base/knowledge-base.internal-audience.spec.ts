import {
  createKnowledgeBaseServiceHarness,
  knowledgeBaseTestIds,
} from './create-knowledge-base-service-harness';
import {
  companyWideKnowledgeVisibilityPolicy,
  isKnowledgeArticleVisibleTo,
  loadKnowledgeArticleVisibilities,
  type KnowledgeArticleVisibilityPolicy,
} from './load-knowledge-article-scope';
import { publishedArticleSeed } from './published-article-seed';
import { vpnArticleInput } from './vpn-article-input';
import type { KnowledgeArticleRecord } from './knowledge-base.types';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

/**
 * W7.79 (`BA-knowledge-base-05`): INTERNAL is the default classification of a
 * knowledge article, so "published INTERNAL is readable by everybody" was an
 * audience nobody had chosen — it was the absence of a rule. These specs pin the
 * replacement: the audience is an explicit installation setting, and when it is
 * off (the default) an internal article is readable only inside its own boundary,
 * from either side of it:
 *
 * - staff whose assignment covers the article's unit **and** service;
 * - employees whose home unit covers the article's unit, with no permission.
 *
 * The company-wide mode is still available and is proven here to be exactly the
 * old behaviour, so an installation that relied on it can keep it knowingly.
 */
const scopedPolicy: KnowledgeArticleVisibilityPolicy = {
  internalCompanyWide: false,
};

function internalArticle(
  overrides: Partial<KnowledgeArticleRecord> = {},
): KnowledgeArticleRecord {
  return publishedArticleSeed({
    id: 'article-internal-vpn',
    slug: 'internal-vpn-runbook',
    title: 'Interni VPN runbook',
    body: 'Kako resetovati VPN klijent unutar IT jedinice.',
    classification: 'INTERNAL',
    ...overrides,
  });
}

describe('Knowledge base — INTERNAL audience policy (W7.79)', () => {
  it('keeps the old company-wide audience when the installation says so', async () => {
    const { articles, memory, configuration, contexts } =
      createKnowledgeBaseServiceHarness();
    configuration.internalCompanyWide = true;
    memory.seedArticle(internalArticle());

    // The requester has a global USER assignment, no home unit and no knowledge
    // permission: the only reason this read works is the explicit policy.
    const read = await articles.getById('article-internal-vpn', {
      actorUserId: knowledgeBaseTestIds.requester,
    });
    expect(read.classification).toBe('INTERNAL');
    expect(
      await loadKnowledgeArticleVisibilities(
        memory.prisma as never,
        contexts.get(knowledgeBaseTestIds.requester) as never,
        [internalArticle()],
        companyWideKnowledgeVisibilityPolicy,
      ),
    ).toEqual(new Set(['article-internal-vpn']));
  });

  it('hides a published INTERNAL article from a reader with no home unit', async () => {
    const { articles, memory, configuration, contexts } =
      createKnowledgeBaseServiceHarness();
    configuration.internalCompanyWide = false;
    memory.seedArticle(internalArticle());

    await expect(
      articles.getById('article-internal-vpn', {
        actorUserId: knowledgeBaseTestIds.requester,
      }),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    const listed = await articles.list(
      {},
      { actorUserId: knowledgeBaseTestIds.requester },
    );
    expect(listed.items.map((item) => item.id)).not.toContain(
      'article-internal-vpn',
    );
    expect(
      await loadKnowledgeArticleVisibilities(
        memory.prisma as never,
        contexts.get(knowledgeBaseTestIds.requester) as never,
        [internalArticle()],
        scopedPolicy,
      ),
    ).toEqual(new Set<string>());
  });

  it('shows it to the employee whose home unit covers the article unit, without a permission', async () => {
    const { articles, memory, configuration } =
      createKnowledgeBaseServiceHarness();
    configuration.internalCompanyWide = false;
    memory.seedArticle(internalArticle());
    // Home unit is the parent of the article's unit: a subtree match, which is the
    // case the end-user portal relies on.
    memory.seedUser({
      id: knowledgeBaseTestIds.requester,
      organizationalUnitId: knowledgeBaseTestIds.ouRoot,
    });

    const read = await articles.getById('article-internal-vpn', {
      actorUserId: knowledgeBaseTestIds.requester,
    });
    expect(read.id).toBe('article-internal-vpn');
    const listed = await articles.list(
      {},
      { actorUserId: knowledgeBaseTestIds.requester },
    );
    expect(listed.items.map((item) => item.id)).toContain(
      'article-internal-vpn',
    );
    // An exact-unit home is a match too.
    memory.seedUser({
      id: knowledgeBaseTestIds.requester,
      organizationalUnitId: knowledgeBaseTestIds.ouIt,
    });
    expect(
      (await articles.getById('article-internal-vpn', {
        actorUserId: knowledgeBaseTestIds.requester,
      })).id,
    ).toBe('article-internal-vpn');
  });

  it('keeps a sibling unit out of the article unit', async () => {
    const { articles, memory, configuration, contexts } =
      createKnowledgeBaseServiceHarness();
    configuration.internalCompanyWide = false;
    memory.seedArticle(internalArticle());
    memory.seedUser({
      id: knowledgeBaseTestIds.requester,
      organizationalUnitId: knowledgeBaseTestIds.ouHr,
    });

    await expect(
      articles.getById('article-internal-vpn', {
        actorUserId: knowledgeBaseTestIds.requester,
      }),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    expect(
      await isKnowledgeArticleVisibleTo(
        memory.prisma as never,
        contexts.get(knowledgeBaseTestIds.requester) as never,
        internalArticle(),
        scopedPolicy,
      ),
    ).toBe(false);
  });

  it('keeps the staff delegation in scope and the foreign agent out', async () => {
    const { memory, configuration, contexts } =
      createKnowledgeBaseServiceHarness();
    configuration.internalCompanyWide = false;
    memory.seedArticle(internalArticle());

    // The IT agent's assignment covers the IT unit and the VPN service, so the
    // internal article stays actionable for the people who work it.
    expect(
      await isKnowledgeArticleVisibleTo(
        memory.prisma as never,
        contexts.get(knowledgeBaseTestIds.agentIt) as never,
        internalArticle(),
        scopedPolicy,
      ),
    ).toBe(true);
    // The HR agent covers neither the unit nor the service.
    expect(
      await isKnowledgeArticleVisibleTo(
        memory.prisma as never,
        contexts.get(knowledgeBaseTestIds.agentHr) as never,
        internalArticle(),
        scopedPolicy,
      ),
    ).toBe(false);
  });

  it('never widens an unpublished INTERNAL draft, whatever the policy says', async () => {
    const { articles, memory, configuration } =
      createKnowledgeBaseServiceHarness();
    configuration.internalCompanyWide = true;
    const draft = await articles.create(vpnArticleInput(), {
      actorUserId: knowledgeBaseTestIds.agentIt,
    });
    memory.seedUser({
      id: knowledgeBaseTestIds.requester,
      organizationalUnitId: knowledgeBaseTestIds.ouRoot,
    });

    await expect(
      articles.getById(draft.id, {
        actorUserId: knowledgeBaseTestIds.requester,
      }),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
  });

  it('leaves CONFIDENTIAL and RESTRICTED on their own boundary', async () => {
    const { articles, memory, configuration } =
      createKnowledgeBaseServiceHarness();
    configuration.internalCompanyWide = true;
    memory.seedArticle(
      internalArticle({ id: 'confidential-vpn', classification: 'CONFIDENTIAL' }),
    );
    memory.seedArticle(
      internalArticle({
        id: 'restricted-vpn',
        classification: 'RESTRICTED',
        ownerUserId: knowledgeBaseTestIds.adminIt,
      }),
    );

    // Company-wide is about INTERNAL only: a USER cannot read either article.
    await expect(
      articles.getById('confidential-vpn', {
        actorUserId: knowledgeBaseTestIds.requester,
      }),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    await expect(
      articles.getById('restricted-vpn', {
        actorUserId: knowledgeBaseTestIds.requester,
      }),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    await expect(
      articles.getById('restricted-vpn', {
        actorUserId: knowledgeBaseTestIds.agentIt,
      }),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
  });

  it('answers the single and the batched check alike under the scoped policy', async () => {
    const { memory, configuration, contexts } =
      createKnowledgeBaseServiceHarness();
    configuration.internalCompanyWide = false;
    const articles = [
      internalArticle(),
      internalArticle({
        id: 'article-internal-hr',
        slug: 'internal-hr-runbook',
        title: 'Interni HR runbook',
        organizationalUnitId: knowledgeBaseTestIds.ouHr,
        serviceId: knowledgeBaseTestIds.servicePayroll,
        ownerUserId: knowledgeBaseTestIds.agentHr,
        reviewerUserId: knowledgeBaseTestIds.agentHr,
      }),
    ];
    for (const article of articles) {
      memory.seedArticle(article);
    }
    memory.seedUser({
      id: knowledgeBaseTestIds.requester,
      organizationalUnitId: knowledgeBaseTestIds.ouRoot,
    });

    for (const actorId of [
      knowledgeBaseTestIds.requester,
      knowledgeBaseTestIds.agentIt,
      knowledgeBaseTestIds.agentHr,
      knowledgeBaseTestIds.adminIt,
    ]) {
      const batched = await loadKnowledgeArticleVisibilities(
        memory.prisma as never,
        contexts.get(actorId) as never,
        articles,
        scopedPolicy,
      );
      for (const article of articles) {
        expect({
          actorId,
          articleId: article.id,
          single: await isKnowledgeArticleVisibleTo(
            memory.prisma as never,
            contexts.get(actorId) as never,
            article,
            scopedPolicy,
          ),
        }).toEqual({
          actorId,
          articleId: article.id,
          single: batched.has(article.id),
        });
      }
    }
    // The parent-unit employee reads both articles: the boundary is on the unit.
    expect(
      await loadKnowledgeArticleVisibilities(
        memory.prisma as never,
        contexts.get(knowledgeBaseTestIds.requester) as never,
        articles,
        scopedPolicy,
      ),
    ).toEqual(new Set(['article-internal-vpn', 'article-internal-hr']));
  });

  it('reads the reader home unit at most once per page, and only when it can matter', async () => {
    const { memory, configuration, contexts } =
      createKnowledgeBaseServiceHarness();
    configuration.internalCompanyWide = false;
    const findUnique = memory.prisma.user.findUnique as unknown as (
      input: unknown,
    ) => Promise<unknown>;
    const spy = jest.fn(findUnique);
    (memory.prisma.user as { findUnique: unknown }).findUnique = spy;
    const context = contexts.get(knowledgeBaseTestIds.requester) as never;
    const page = [
      internalArticle(),
      internalArticle({ id: 'article-2', slug: 'article-2' }),
      internalArticle({ id: 'article-3', slug: 'article-3' }),
    ];

    await loadKnowledgeArticleVisibilities(
      memory.prisma as never,
      context,
      page,
      scopedPolicy,
    );
    expect(spy).toHaveBeenCalledTimes(1);

    spy.mockClear();
    await loadKnowledgeArticleVisibilities(
      memory.prisma as never,
      context,
      page,
      companyWideKnowledgeVisibilityPolicy,
    );
    expect(spy).not.toHaveBeenCalled();

    spy.mockClear();
    await loadKnowledgeArticleVisibilities(
      memory.prisma as never,
      context,
      [internalArticle({ classification: 'CONFIDENTIAL' })],
      scopedPolicy,
    );
    expect(spy).not.toHaveBeenCalled();
  });
});
