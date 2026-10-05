import {
  createKnowledgeBaseServiceHarness,
  knowledgeBaseTestIds,
} from './create-knowledge-base-service-harness';
import { knowledgeBaseConstants } from './knowledge-base.constants';
import { publishedArticleSeed } from './published-article-seed';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

type FakeDelegate = { findMany: (...args: never[]) => unknown };

describe('Knowledge base — batched visibility and bounded intercept (Val 3, M14/B5)', () => {
  it('resolves a whole page with one service and one group-member query', async () => {
    const { articles, memory } = createKnowledgeBaseServiceHarness();
    memory.seedArticle(publishedArticleSeed({ id: 'kb-1', slug: 'kb-1' }));
    memory.seedArticle(
      publishedArticleSeed({
        id: 'kb-2',
        slug: 'kb-2',
        ownerGroupId: knowledgeBaseTestIds.groupIt,
      }),
    );
    memory.seedArticle(
      publishedArticleSeed({
        id: 'kb-3',
        slug: 'kb-3',
        organizationalUnitId: knowledgeBaseTestIds.ouHr,
        serviceId: knowledgeBaseTestIds.servicePayroll,
      }),
    );
    const prisma = memory.prisma as unknown as {
      service: FakeDelegate;
      groupMember: FakeDelegate;
    };
    const serviceFindMany = jest.spyOn(prisma.service, 'findMany');
    const groupMemberFindMany = jest.spyOn(prisma.groupMember, 'findMany');

    const rows = await articles.list({}, { actorUserId: knowledgeBaseTestIds.requester });

    expect(rows.map((row) => row.id).sort()).toEqual(['kb-1', 'kb-2', 'kb-3']);
    // Three articles, but the visibility check costs one batched service query
    // (the second `service.findMany` loads the label names for the page) and one
    // batched group-member query — not three per article.
    expect(serviceFindMany.mock.calls.length).toBeLessThanOrEqual(2);
    expect(groupMemberFindMany).toHaveBeenCalledTimes(1);
  });

  it('caps and orders the intercept candidates before ranking', async () => {
    const { discovery, memory } = createKnowledgeBaseServiceHarness();
    memory.seedArticle(publishedArticleSeed({ id: 'kb-1', slug: 'kb-1' }));
    const prisma = memory.prisma as unknown as { knowledgeArticle: FakeDelegate };
    const findMany = jest.spyOn(prisma.knowledgeArticle, 'findMany');

    await discovery.intercept(
      { serviceId: knowledgeBaseTestIds.serviceVpn, query: 'vpn' },
      { actorUserId: knowledgeBaseTestIds.requester },
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        take: knowledgeBaseConstants.interceptCandidateLimit,
      }),
    );
  });
});
