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

const vpn = knowledgeBaseTestIds.serviceVpn;
const itUnit = knowledgeBaseTestIds.ouIt;

describe('KnowledgeBase delegation (BA-knowledge-base-01)', () => {
  it('lets an owner without any knowledge permission write inside the article scope', async () => {
    const { articles, memory } = createKnowledgeBaseServiceHarness();
    const created = await articles.create(
      {
        title: 'VPN klijent za macOS',
        body: 'Instalirajte paket i prijavite se kroz SSO.',
        serviceId: vpn,
        organizationalUnitId: itUnit,
        ownerUserId: knowledgeBaseTestIds.ownerUser,
        reason: 'create owned draft',
      },
      { actorUserId: knowledgeBaseTestIds.agentIt },
    );

    const updated = await articles.update(
      created.id,
      { body: 'Ažurirano od vlasnika.', reason: 'owner edit' },
      { actorUserId: knowledgeBaseTestIds.ownerUser },
    );

    expect(updated.body).toContain('vlasnika');
    // The delegation write is audited like any other mutation.
    expect(memory.changeLogs.at(-1)).toMatchObject({
      actorUserId: knowledgeBaseTestIds.ownerUser,
      reason: 'owner edit',
    });
  });

  it('does not treat a global USER assignment as an article scope', async () => {
    const { articles, memory } = createKnowledgeBaseServiceHarness();
    memory.seedArticle(
      publishedArticleSeed({
        id: 'owned-by-requester',
        status: 'DRAFT',
        publishedAt: null,
        lastReviewedAt: null,
        ownerUserId: knowledgeBaseTestIds.requester,
      }),
    );

    await expect(
      articles.update(
        'owned-by-requester',
        { body: 'Pokušaj bez scopea.', reason: 'no scope' },
        { actorUserId: knowledgeBaseTestIds.requester },
      ),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    await expect(
      articles.getById('owned-by-requester', {
        actorUserId: knowledgeBaseTestIds.requester,
      }),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
  });

  it('ends the delegation when the owner holds a foreign OU assignment', async () => {
    const { articles, memory } = createKnowledgeBaseServiceHarness();
    memory.seedArticle(
      publishedArticleSeed({
        id: 'owned-by-hr',
        status: 'DRAFT',
        publishedAt: null,
        lastReviewedAt: null,
        ownerUserId: knowledgeBaseTestIds.agentHr,
      }),
    );

    await expect(
      articles.update(
        'owned-by-hr',
        { body: 'Tuđi OU.', reason: 'foreign ou' },
        { actorUserId: knowledgeBaseTestIds.agentHr },
      ),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    expect(
      (await articles.list({}, { actorUserId: knowledgeBaseTestIds.agentHr })).items,
    ).not.toContainEqual(expect.objectContaining({ id: 'owned-by-hr' }));
  });

  it('ends the delegation when the owner is scoped to another service', async () => {
    const { articles, memory, contexts } = createKnowledgeBaseServiceHarness();
    memory.seedUser({ id: 'user-owner-payroll' });
    contexts.set(
      'user-owner-payroll',
      createTestAuthorizationContext({
        subjectId: 'user-owner-payroll',
        assignments: [
          createTestAssignment({
            roleKey: authorizationRoleKeys.user,
            permissionKeys: [],
            organizationalUnitId: itUnit,
            organizationalUnitPath: '/Korisnici/IT',
            serviceId: knowledgeBaseTestIds.servicePayroll,
          }),
        ],
      }),
    );
    memory.seedArticle(
      publishedArticleSeed({
        id: 'owned-by-payroll',
        status: 'DRAFT',
        publishedAt: null,
        lastReviewedAt: null,
        ownerUserId: 'user-owner-payroll',
      }),
    );

    await expect(
      articles.update(
        'owned-by-payroll',
        { body: 'Tuđi servis.', reason: 'foreign service' },
        { actorUserId: 'user-owner-payroll' },
      ),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
  });

  it('scopes owner-group membership and revokes it on the next request', async () => {
    const { articles, memory } = createKnowledgeBaseServiceHarness();
    const groupOwned = publishedArticleSeed({
      id: 'group-owned',
      status: 'DRAFT',
      publishedAt: null,
      lastReviewedAt: null,
      ownerGroupId: knowledgeBaseTestIds.groupIt,
    });
    memory.seedArticle({ ...groupOwned, ownerUserId: null });
    memory.seedGroupMember({
      groupId: knowledgeBaseTestIds.groupIt,
      userId: knowledgeBaseTestIds.ownerUser,
    });
    memory.seedGroupMember({
      groupId: knowledgeBaseTestIds.groupIt,
      userId: knowledgeBaseTestIds.requester,
    });

    // A scoped member inherits the delegation…
    await expect(
      articles.update(
        'group-owned',
        { body: 'Član grupe u scopeu.', reason: 'group member edit' },
        { actorUserId: knowledgeBaseTestIds.ownerUser },
      ),
    ).resolves.toMatchObject({ id: 'group-owned' });
    // …while a global USER in the same group does not.
    await expect(
      articles.update(
        'group-owned',
        { body: 'Bez scopea.', reason: 'group member without scope' },
        { actorUserId: knowledgeBaseTestIds.requester },
      ),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });

    // Revoking the membership is effective on the very next request.
    await memory.prisma.groupMember.deleteMany({
      where: {
        groupId: knowledgeBaseTestIds.groupIt,
        userId: knowledgeBaseTestIds.ownerUser,
      },
    });
    await expect(
      articles.update(
        'group-owned',
        { body: 'Poslije revokea.', reason: 'after revoke' },
        { actorUserId: knowledgeBaseTestIds.ownerUser },
      ),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    await expect(
      articles.getById('group-owned', {
        actorUserId: knowledgeBaseTestIds.ownerUser,
      }),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
  });

  it('keeps the platform super admin bypass and scoped writers intact', async () => {
    const { articles, memory } = createKnowledgeBaseServiceHarness();
    memory.seedArticle(
      publishedArticleSeed({
        id: 'owned-by-requester',
        status: 'DRAFT',
        publishedAt: null,
        lastReviewedAt: null,
        ownerUserId: knowledgeBaseTestIds.requester,
      }),
    );

    await expect(
      articles.update(
        'owned-by-requester',
        { body: 'Super admin ispravka.', reason: 'super admin edit' },
        { actorUserId: knowledgeBaseTestIds.superAdmin },
      ),
    ).resolves.toMatchObject({ id: 'owned-by-requester' });
    // A scoped writer keeps writing through the permission, not the delegation.
    memory.seedArticle(
      publishedArticleSeed({ id: 'draft-it', status: 'DRAFT', publishedAt: null, lastReviewedAt: null }),
    );
    await expect(
      articles.update(
        'draft-it',
        { body: 'Scoped writer.', reason: 'scoped writer edit' },
        { actorUserId: knowledgeBaseTestIds.agentIt },
      ),
    ).resolves.toMatchObject({ id: 'draft-it' });
  });
});
