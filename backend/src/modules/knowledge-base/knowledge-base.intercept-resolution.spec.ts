import {
  createKnowledgeBaseServiceHarness,
  knowledgeBaseTestIds,
} from './create-knowledge-base-service-harness';
import { publishedArticleSeed } from './published-article-seed';
import type { KnowledgeArticleRecord } from './knowledge-base.types';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

/**
 * W7.80 (`BA-knowledge-base-06`): a deflection is a claim about the past, so the endpoint that records it
 * checks the claim instead of trusting it. Before, `POST /knowledge-base/intercept/resolve` verified only that
 * the service, the unit and the optional article **exist**: any signed-in user could record a resolution for a
 * foreign unit or service, for a draft or archived article, or for an article they cannot read — and every
 * such row still counted in deflection analytics. A missing article also answered `NOT_FOUND` while a hidden
 * one answered nothing, so the endpoint confirmed existence.
 *
 * These specs pin the verified contract: the unit must be one the caller could have opened the ticket in, the
 * article must be published, readable and of the claimed service, an unknown id is indistinguishable from a
 * hidden one, the feature switch closes the write, and no failed attempt leaves a row behind.
 */
function itArticle(
  overrides: Partial<KnowledgeArticleRecord> = {},
): KnowledgeArticleRecord {
  return publishedArticleSeed({
    id: 'vpn-internal',
    slug: 'vpn-internal',
    title: 'Reset VPN password',
    classification: 'INTERNAL',
    ...overrides,
  });
}

async function resolutionsOf(
  memory: ReturnType<typeof createKnowledgeBaseServiceHarness>['memory'],
  userId: string,
) {
  return memory.prisma.knowledgeInterceptResolution.findMany({
    where: { userId },
  });
}

describe('Knowledge intercept resolution (W7.80)', () => {
  it('records a deflection for the caller own unit', async () => {
    const { discovery, memory } = createKnowledgeBaseServiceHarness();
    memory.seedUser({
      id: knowledgeBaseTestIds.requester,
      organizationalUnitId: knowledgeBaseTestIds.ouIt,
    });

    const created = await discovery.resolveIntercept(
      {
        serviceId: knowledgeBaseTestIds.serviceVpn,
        organizationalUnitId: knowledgeBaseTestIds.ouIt,
      },
      { actorUserId: knowledgeBaseTestIds.requester },
    );
    expect(created.id).toEqual(expect.any(String));
    const rows = await resolutionsOf(memory, knowledgeBaseTestIds.requester);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      serviceId: knowledgeBaseTestIds.serviceVpn,
      organizationalUnitId: knowledgeBaseTestIds.ouIt,
      primaryArticleId: null,
    });
  });

  it('records the article the caller was actually shown', async () => {
    const { discovery, memory } = createKnowledgeBaseServiceHarness();
    memory.seedUser({
      id: knowledgeBaseTestIds.requester,
      organizationalUnitId: knowledgeBaseTestIds.ouIt,
    });
    memory.seedArticle(itArticle());

    await discovery.resolveIntercept(
      {
        serviceId: knowledgeBaseTestIds.serviceVpn,
        organizationalUnitId: knowledgeBaseTestIds.ouIt,
        articleId: 'vpn-internal',
      },
      { actorUserId: knowledgeBaseTestIds.requester },
    );
    const rows = await resolutionsOf(memory, knowledgeBaseTestIds.requester);
    expect(rows[0]?.primaryArticleId).toBe('vpn-internal');
  });

  it('refuses a foreign unit a plain user cannot open a ticket in', async () => {
    const { discovery, memory } = createKnowledgeBaseServiceHarness();
    memory.seedUser({
      id: knowledgeBaseTestIds.requester,
      organizationalUnitId: knowledgeBaseTestIds.ouHr,
    });

    await expect(
      discovery.resolveIntercept(
        {
          serviceId: knowledgeBaseTestIds.serviceVpn,
          organizationalUnitId: knowledgeBaseTestIds.ouIt,
        },
        { actorUserId: knowledgeBaseTestIds.requester },
      ),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    // The forged analytics row would be invisible in the response but present in the reports.
    expect(await resolutionsOf(memory, knowledgeBaseTestIds.requester)).toEqual(
      [],
    );
  });

  it('lets staff record for a unit their assignment covers, and refuses a foreign one', async () => {
    const { discovery, memory } = createKnowledgeBaseServiceHarness();

    // The IT agent covers the IT unit and any service in it, so the deflection is theirs to report.
    const created = await discovery.resolveIntercept(
      {
        serviceId: knowledgeBaseTestIds.serviceVpn,
        organizationalUnitId: knowledgeBaseTestIds.ouIt,
      },
      { actorUserId: knowledgeBaseTestIds.agentIt },
    );
    expect(created.id).toEqual(expect.any(String));

    await expect(
      discovery.resolveIntercept(
        {
          serviceId: knowledgeBaseTestIds.serviceVpn,
          organizationalUnitId: knowledgeBaseTestIds.ouIt,
        },
        { actorUserId: knowledgeBaseTestIds.agentHr },
      ),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    expect(await resolutionsOf(memory, knowledgeBaseTestIds.agentHr)).toEqual([]);
  });

  it('refuses a plain user who has no home unit at all', async () => {
    const { discovery, memory } = createKnowledgeBaseServiceHarness();

    await expect(
      discovery.resolveIntercept(
        {
          serviceId: knowledgeBaseTestIds.serviceVpn,
          organizationalUnitId: knowledgeBaseTestIds.ouIt,
        },
        { actorUserId: knowledgeBaseTestIds.requester },
      ),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    expect(await resolutionsOf(memory, knowledgeBaseTestIds.requester)).toEqual(
      [],
    );
  });

  it('lets a super admin record for any unit', async () => {
    const { discovery, memory } = createKnowledgeBaseServiceHarness();

    const created = await discovery.resolveIntercept(
      {
        serviceId: knowledgeBaseTestIds.serviceVpn,
        organizationalUnitId: knowledgeBaseTestIds.ouHr,
      },
      { actorUserId: knowledgeBaseTestIds.superAdmin },
    );
    expect(created.id).toEqual(expect.any(String));
    expect(
      await resolutionsOf(memory, knowledgeBaseTestIds.superAdmin),
    ).toHaveLength(1);
  });

  it('refuses an article of another service, a draft and an archived text', async () => {
    const { discovery, memory } = createKnowledgeBaseServiceHarness();
    memory.seedUser({
      id: knowledgeBaseTestIds.requester,
      organizationalUnitId: knowledgeBaseTestIds.ouIt,
    });
    // Readable by the caller, but it answers the payroll service — crediting VPN would be a lie.
    memory.seedArticle(
      itArticle({
        id: 'payroll-internal',
        slug: 'payroll-internal',
        serviceId: knowledgeBaseTestIds.servicePayroll,
      }),
    );
    memory.seedArticle(
      itArticle({ id: 'vpn-draft', slug: 'vpn-draft', status: 'DRAFT' }),
    );
    memory.seedArticle(
      itArticle({ id: 'vpn-archived', slug: 'vpn-archived', status: 'ARCHIVED' }),
    );

    for (const articleId of ['payroll-internal', 'vpn-draft', 'vpn-archived']) {
      await expect(
        discovery.resolveIntercept(
          {
            serviceId: knowledgeBaseTestIds.serviceVpn,
            organizationalUnitId: knowledgeBaseTestIds.ouIt,
            articleId,
          },
          { actorUserId: knowledgeBaseTestIds.requester },
        ),
      ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    }
    expect(await resolutionsOf(memory, knowledgeBaseTestIds.requester)).toEqual(
      [],
    );
  });

  it('refuses an article the caller cannot read, and an id that does not exist', async () => {
    const { discovery, memory } = createKnowledgeBaseServiceHarness();
    memory.seedUser({
      id: knowledgeBaseTestIds.requester,
      organizationalUnitId: knowledgeBaseTestIds.ouIt,
    });
    memory.seedArticle(
      itArticle({
        id: 'vpn-confidential',
        slug: 'vpn-confidential',
        classification: 'CONFIDENTIAL',
      }),
    );

    const hidden = await discovery
      .resolveIntercept(
        {
          serviceId: knowledgeBaseTestIds.serviceVpn,
          organizationalUnitId: knowledgeBaseTestIds.ouIt,
          articleId: 'vpn-confidential',
        },
        { actorUserId: knowledgeBaseTestIds.requester },
      )
      .catch((error: { response?: { code?: string } }) => error);
    const missing = await discovery
      .resolveIntercept(
        {
          serviceId: knowledgeBaseTestIds.serviceVpn,
          organizationalUnitId: knowledgeBaseTestIds.ouIt,
          articleId: 'no-such-article',
        },
        { actorUserId: knowledgeBaseTestIds.requester },
      )
      .catch((error: { response?: { code?: string } }) => error);
    // Same answer for both: the endpoint is no longer an existence oracle.
    expect(hidden).toMatchObject({ response: { code: 'FORBIDDEN' } });
    expect(missing).toMatchObject({ response: { code: 'FORBIDDEN' } });
    expect(await resolutionsOf(memory, knowledgeBaseTestIds.requester)).toEqual(
      [],
    );
  });

  it('records nothing while the intercept feature is off', async () => {
    const { discovery, memory, configuration } =
      createKnowledgeBaseServiceHarness();
    configuration.interceptEnabled = false;
    memory.seedUser({
      id: knowledgeBaseTestIds.requester,
      organizationalUnitId: knowledgeBaseTestIds.ouIt,
    });

    await expect(
      discovery.resolveIntercept(
        {
          serviceId: knowledgeBaseTestIds.serviceVpn,
          organizationalUnitId: knowledgeBaseTestIds.ouIt,
        },
        { actorUserId: knowledgeBaseTestIds.requester },
      ),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    expect(await resolutionsOf(memory, knowledgeBaseTestIds.requester)).toEqual(
      [],
    );
    expect(await memory.prisma.knowledgeInterceptResolution.count()).toBe(0);
  });

  it('keeps existing reference errors for the service and the unit', async () => {
    const { discovery, memory } = createKnowledgeBaseServiceHarness();
    memory.seedUser({
      id: knowledgeBaseTestIds.requester,
      organizationalUnitId: knowledgeBaseTestIds.ouIt,
    });

    await expect(
      discovery.resolveIntercept(
        {
          serviceId: 'no-such-service',
          organizationalUnitId: knowledgeBaseTestIds.ouIt,
        },
        { actorUserId: knowledgeBaseTestIds.requester },
      ),
    ).rejects.toMatchObject({ response: { code: 'SERVICE_NOT_FOUND' } });
    await expect(
      discovery.resolveIntercept(
        {
          serviceId: knowledgeBaseTestIds.serviceVpn,
          organizationalUnitId: 'no-such-unit',
        },
        { actorUserId: knowledgeBaseTestIds.requester },
      ),
    ).rejects.toMatchObject({
      response: { code: 'ORGANIZATIONAL_UNIT_NOT_FOUND' },
    });
    expect(await resolutionsOf(memory, knowledgeBaseTestIds.requester)).toEqual(
      [],
    );
  });
});
