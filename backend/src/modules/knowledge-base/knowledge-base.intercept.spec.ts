import {
  createKnowledgeBaseServiceHarness,
  knowledgeBaseTestIds,
} from './create-knowledge-base-service-harness';
import { publishedArticleSeed } from './published-article-seed';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('Knowledge intercept', () => {
  it('returns an empty list when the service has no published articles', async () => {
    const { discovery } = createKnowledgeBaseServiceHarness();
    const result = await discovery.intercept(
      { serviceId: knowledgeBaseTestIds.serviceVpn, query: 'vpn' },
      { actorUserId: knowledgeBaseTestIds.requester },
    );
    expect(result.articles).toEqual([]);
  });

  it('returns ranked published articles and excludes unauthorized ones', async () => {
    const { discovery, memory } = createKnowledgeBaseServiceHarness();
    memory.seedArticle(
      publishedArticleSeed({
        id: 'vpn-reset',
        slug: 'vpn-reset',
        title: 'Reset VPN password',
        body: 'Portal reset steps',
      }),
    );
    memory.seedArticle(
      publishedArticleSeed({
        id: 'wifi-help',
        slug: 'wifi-help',
        title: 'Office wifi',
        body: 'Connect to wireless',
        publishedAt: new Date('2026-09-10T00:00:00.000Z'),
      }),
    );
    memory.seedArticle(
      publishedArticleSeed({
        id: 'vpn-secret',
        slug: 'vpn-secret',
        title: 'VPN privileged reset',
        classification: 'CONFIDENTIAL',
      }),
    );
    memory.seedArticle(
      publishedArticleSeed({
        id: 'vpn-draft',
        slug: 'vpn-draft',
        title: 'Draft VPN notes',
        status: 'DRAFT',
      }),
    );
    const result = await discovery.intercept(
      { serviceId: knowledgeBaseTestIds.serviceVpn, query: 'vpn password' },
      { actorUserId: knowledgeBaseTestIds.requester },
    );
    expect(result.articles.map((item) => item.id)).toEqual([
      'vpn-reset',
      'wifi-help',
    ]);
    expect(result.articles.map((item) => item.id)).not.toContain('vpn-secret');
    expect(result.articles.map((item) => item.id)).not.toContain('vpn-draft');
  });

  it('returns nothing when the intercept addon is disabled', async () => {
    const { discovery, memory, configuration } =
      createKnowledgeBaseServiceHarness();
    memory.seedArticle(publishedArticleSeed());
    configuration.interceptEnabled = false;
    const result = await discovery.intercept(
      { serviceId: knowledgeBaseTestIds.serviceVpn, query: 'vpn' },
      { actorUserId: knowledgeBaseTestIds.requester },
    );
    expect(result.articles).toEqual([]);
  });

  it('changes ranking after helpful feedback', async () => {
    const { discovery, memory } = createKnowledgeBaseServiceHarness();
    memory.seedArticle(
      publishedArticleSeed({
        id: 'vpn-reset',
        slug: 'vpn-reset',
        title: 'Reset VPN password',
        publishedAt: new Date('2026-08-01T00:00:00.000Z'),
      }),
    );
    memory.seedArticle(
      publishedArticleSeed({
        id: 'vpn-client',
        slug: 'vpn-client',
        title: 'Install VPN client',
        body: 'Download the VPN package',
        publishedAt: new Date('2026-09-10T00:00:00.000Z'),
      }),
    );
    const before = await discovery.intercept(
      { serviceId: knowledgeBaseTestIds.serviceVpn, query: '' },
      { actorUserId: knowledgeBaseTestIds.requester },
    );
    expect(before.articles[0]?.id).toBe('vpn-client');
    await discovery.submitFeedback(
      'vpn-reset',
      { isHelpful: true },
      { actorUserId: knowledgeBaseTestIds.requester },
    );
    await discovery.submitFeedback(
      'vpn-client',
      { isHelpful: false },
      { actorUserId: knowledgeBaseTestIds.requester },
    );
    const after = await discovery.intercept(
      { serviceId: knowledgeBaseTestIds.serviceVpn, query: '' },
      { actorUserId: knowledgeBaseTestIds.requester },
    );
    expect(after.articles[0]?.id).toBe('vpn-reset');
    expect(after.articles[0]?.score).toBeGreaterThan(after.articles[1]?.score ?? 0);
  });
});
