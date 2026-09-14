import {
  createKnowledgeBaseServiceHarness,
  knowledgeBaseTestIds,
} from './create-knowledge-base-service-harness';
import { publishedArticleSeed } from './published-article-seed';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('KnowledgeBaseService list filters', () => {
  it('filters by organizationalUnitId and text query', async () => {
    const { articles, memory } = createKnowledgeBaseServiceHarness();
    memory.seedArticle(
      publishedArticleSeed({
        id: 'kb-vpn',
        title: 'Reset VPN password',
        slug: 'reset-vpn',
      }),
    );
    memory.seedArticle(
      publishedArticleSeed({
        id: 'kb-pay',
        title: 'Payroll calendar',
        slug: 'payroll',
        body: 'HR payroll dates',
        organizationalUnitId: knowledgeBaseTestIds.ouHr,
        serviceId: knowledgeBaseTestIds.servicePayroll,
      }),
    );
    const actor = { actorUserId: knowledgeBaseTestIds.superAdmin };
    const byOu = await articles.list(
      { organizationalUnitId: knowledgeBaseTestIds.ouIt },
      actor,
    );
    expect(byOu.map((row) => row.id)).toEqual(['kb-vpn']);
    const byQuery = await articles.list({ q: 'vpn' }, actor);
    expect(byQuery.map((row) => row.id)).toEqual(['kb-vpn']);
  });
});
