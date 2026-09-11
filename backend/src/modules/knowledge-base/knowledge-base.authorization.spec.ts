import {
  createKnowledgeBaseServiceHarness,
  knowledgeBaseTestIds,
} from './create-knowledge-base-service-harness';
import { publishedArticleSeed } from './published-article-seed';
import { vpnArticleInput } from './vpn-article-input';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('KnowledgeBaseService authorization', () => {
  it('rejects USER create and HR agent writes into IT', async () => {
    const { articles } = createKnowledgeBaseServiceHarness();
    await expect(
      articles.create(vpnArticleInput(), {
        actorUserId: knowledgeBaseTestIds.requester,
      }),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    await expect(
      articles.create(vpnArticleInput(), {
        actorUserId: knowledgeBaseTestIds.agentHr,
      }),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
  });

  it('allows an IT agent to create in IT service scope', async () => {
    const { articles } = createKnowledgeBaseServiceHarness();
    const created = await articles.create(vpnArticleInput(), {
      actorUserId: knowledgeBaseTestIds.agentIt,
    });
    expect(created.status).toBe('DRAFT');
    expect(created.serviceId).toBe(knowledgeBaseTestIds.serviceVpn);
  });

  it('hides drafts from requesters and published confidential articles from users', async () => {
    const { articles, memory } = createKnowledgeBaseServiceHarness();
    const draft = await articles.create(vpnArticleInput(), {
      actorUserId: knowledgeBaseTestIds.agentIt,
    });
    await expect(
      articles.getById(draft.id, {
        actorUserId: knowledgeBaseTestIds.requester,
      }),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    memory.seedArticle(
      publishedArticleSeed({
        id: 'confidential-vpn',
        slug: 'confidential-vpn',
        classification: 'CONFIDENTIAL',
      }),
    );
    await expect(
      articles.getById('confidential-vpn', {
        actorUserId: knowledgeBaseTestIds.requester,
      }),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    const visible = await articles.getById('confidential-vpn', {
      actorUserId: knowledgeBaseTestIds.agentIt,
    });
    expect(visible.classification).toBe('CONFIDENTIAL');
  });

  it('hides restricted articles from agents and foreign OU admins', async () => {
    const { articles, memory } = createKnowledgeBaseServiceHarness();
    memory.seedArticle({
      id: 'restricted-vpn',
      slug: 'restricted-vpn',
      title: 'Privileged VPN',
      body: 'Restricted runbook',
      status: 'PUBLISHED',
      classification: 'RESTRICTED',
      isStale: false,
      reviewDueAt: null,
      publishedAt: new Date('2026-09-11T12:00:00.000Z'),
      lastReviewedAt: new Date('2026-09-11T12:00:00.000Z'),
      archivedAt: null,
      ownerUserId: knowledgeBaseTestIds.adminIt,
      ownerGroupId: null,
      reviewerUserId: knowledgeBaseTestIds.adminIt,
      serviceId: knowledgeBaseTestIds.serviceVpn,
      organizationalUnitId: knowledgeBaseTestIds.ouIt,
      createdAt: new Date('2026-09-11T12:00:00.000Z'),
      updatedAt: new Date('2026-09-11T12:00:00.000Z'),
    });
    await expect(
      articles.getById('restricted-vpn', {
        actorUserId: knowledgeBaseTestIds.agentIt,
      }),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    const listedForHr = await articles.list(
      {},
      { actorUserId: knowledgeBaseTestIds.agentHr },
    );
    expect(listedForHr.map((item) => item.id)).not.toContain('restricted-vpn');
    const visible = await articles.getById('restricted-vpn', {
      actorUserId: knowledgeBaseTestIds.adminIt,
    });
    expect(visible.classification).toBe('RESTRICTED');
  });

  it('lets the owner edit a draft and the assigned reviewer approve it', async () => {
    const { articles, workflow } = createKnowledgeBaseServiceHarness();
    const created = await articles.create(
      vpnArticleInput({
        ownerUserId: knowledgeBaseTestIds.ownerUser,
        reviewerUserId: knowledgeBaseTestIds.reviewerUser,
      }),
      { actorUserId: knowledgeBaseTestIds.agentIt },
    );
    const updated = await articles.update(
      created.id,
      { body: 'Updated owner draft body.', reason: 'owner edit' },
      { actorUserId: knowledgeBaseTestIds.ownerUser },
    );
    expect(updated.body).toContain('Updated owner');
    await workflow.submitReview(
      created.id,
      { reason: 'submit for review' },
      { actorUserId: knowledgeBaseTestIds.ownerUser },
    );
    const approved = await workflow.approveReview(
      created.id,
      { reason: 'reviewer approve' },
      { actorUserId: knowledgeBaseTestIds.reviewerUser },
    );
    expect(approved.lastReviewedAt).not.toBeNull();
    await expect(
      workflow.publish(
        created.id,
        { reason: 'owner publish' },
        { actorUserId: knowledgeBaseTestIds.ownerUser },
      ),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
  });
});
