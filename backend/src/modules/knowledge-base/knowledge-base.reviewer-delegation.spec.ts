import { authorizationRoleKeys } from '../authorization/authorization.constants';
import {
  createTestAssignment,
  createTestAuthorizationContext,
} from '../authorization/create-test-authorization-context';
import {
  createKnowledgeBaseServiceHarness,
  knowledgeBaseTestIds,
} from './create-knowledge-base-service-harness';
import { publishedArticleSeed } from './published-article-seed';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const itUnit = knowledgeBaseTestIds.ouIt;
const itPath = '/Korisnici/IT';

function scopedUserContext(subjectId: string, serviceId: string | null = null) {
  return createTestAuthorizationContext({
    subjectId,
    assignments: [
      createTestAssignment({
        roleKey: authorizationRoleKeys.user,
        permissionKeys: [],
        organizationalUnitId: itUnit,
        organizationalUnitPath: itPath,
        serviceId,
      }),
    ],
  });
}

describe('KnowledgeBase reviewer delegation (BA-knowledge-base-02)', () => {
  it('lets a scoped reviewer without a review permission read and approve', async () => {
    const { articles, workflow } = createKnowledgeBaseServiceHarness();
    const created = await articles.create(
      {
        title: 'VPN za Linux',
        body: 'Konfiguracija klijenta.',
        serviceId: knowledgeBaseTestIds.serviceVpn,
        organizationalUnitId: itUnit,
        ownerUserId: knowledgeBaseTestIds.agentIt,
        reviewerUserId: knowledgeBaseTestIds.reviewerUser,
        reason: 'create with reviewer',
      },
      { actorUserId: knowledgeBaseTestIds.agentIt },
    );
    await workflow.submitReview(
      created.id,
      { reason: 'submit' },
      { actorUserId: knowledgeBaseTestIds.agentIt },
    );

    const draft = await articles.getById(created.id, {
      actorUserId: knowledgeBaseTestIds.reviewerUser,
    });
    expect(draft.status).toBe('IN_REVIEW');

    const approved = await workflow.approveReview(
      created.id,
      { reason: 'reviewer approve' },
      { actorUserId: knowledgeBaseTestIds.reviewerUser },
    );
    expect(approved.lastReviewedAt).not.toBeNull();
  });

  it('refuses a reviewer whose assignment lives in another OU', async () => {
    const { articles, workflow, memory } = createKnowledgeBaseServiceHarness();
    const assigned = publishedArticleSeed({
      id: 'foreign-reviewer',
      status: 'IN_REVIEW',
      publishedAt: null,
      lastReviewedAt: null,
      reviewerUserId: knowledgeBaseTestIds.agentHr,
    });
    memory.seedArticle(assigned);

    await expect(
      articles.getById('foreign-reviewer', {
        actorUserId: knowledgeBaseTestIds.agentHr,
      }),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    await expect(
      workflow.approveReview(
        'foreign-reviewer',
        { reason: 'foreign ou approve' },
        { actorUserId: knowledgeBaseTestIds.agentHr },
      ),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
  });

  it('ends the review delegation when the reviewer is scoped to another service', async () => {
    const { workflow, memory, contexts } = createKnowledgeBaseServiceHarness();
    contexts.set(
      knowledgeBaseTestIds.reviewerUser,
      scopedUserContext(
        knowledgeBaseTestIds.reviewerUser,
        knowledgeBaseTestIds.servicePayroll,
      ),
    );
    memory.seedArticle(
      publishedArticleSeed({
        id: 'service-reviewer',
        status: 'IN_REVIEW',
        publishedAt: null,
        lastReviewedAt: null,
        reviewerUserId: knowledgeBaseTestIds.reviewerUser,
      }),
    );

    await expect(
      workflow.approveReview(
        'service-reviewer',
        { reason: 'wrong service' },
        { actorUserId: knowledgeBaseTestIds.reviewerUser },
      ),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
  });

  it('revokes review rights when the assignment is cleared', async () => {
    const { articles, workflow } = createKnowledgeBaseServiceHarness();
    const created = await articles.create(
      {
        title: 'VPN za Android',
        body: 'Konfiguracija klijenta.',
        serviceId: knowledgeBaseTestIds.serviceVpn,
        organizationalUnitId: itUnit,
        ownerUserId: knowledgeBaseTestIds.agentIt,
        reviewerUserId: knowledgeBaseTestIds.reviewerUser,
        reason: 'create with reviewer',
      },
      { actorUserId: knowledgeBaseTestIds.agentIt },
    );
    await workflow.submitReview(
      created.id,
      { reason: 'submit' },
      { actorUserId: knowledgeBaseTestIds.agentIt },
    );
    await articles.update(
      created.id,
      { reviewerUserId: null, reason: 'reviewer revoked' },
      { actorUserId: knowledgeBaseTestIds.agentIt },
    );

    await expect(
      workflow.approveReview(
        created.id,
        { reason: 'after revoke' },
        { actorUserId: knowledgeBaseTestIds.reviewerUser },
      ),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    await expect(
      articles.getById(created.id, {
        actorUserId: knowledgeBaseTestIds.reviewerUser,
      }),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
  });

  it('still honours the scoped review permission of a manager', async () => {
    const { workflow, memory } = createKnowledgeBaseServiceHarness();
    memory.seedArticle(
      publishedArticleSeed({
        id: 'manager-review',
        status: 'IN_REVIEW',
        publishedAt: null,
        lastReviewedAt: null,
        reviewerUserId: knowledgeBaseTestIds.reviewerUser,
      }),
    );

    // `adminIt` holds `knowledge.article.review` in the IT scope and is not the
    // assigned reviewer — the permission, not the delegation, carries the right.
    const approved = await workflow.approveReview(
      'manager-review',
      { reason: 'manager approve' },
      { actorUserId: knowledgeBaseTestIds.adminIt },
    );
    expect(approved.lastReviewedAt).not.toBeNull();
  });
});
