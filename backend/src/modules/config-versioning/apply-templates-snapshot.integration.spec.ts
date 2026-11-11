import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { createConfigSnapshotFixture } from './create-config-snapshot-fixture';
import type { ConfigSnapshot } from './config-versioning.types';
import { configVersioningErrorCodes } from './config-versioning.constants';
import { applyTemplatesSnapshot } from './apply-templates-snapshot';

const databaseUrl = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = databaseUrl ? describe : describe.skip;
const stamp = `${Date.now()}-${process.pid}`;

type Fixture = {
  readonly suffix: string;
  readonly actorId: string;
  readonly unitId: string;
  readonly categoryId: string;
  readonly serviceIds: readonly [string, string];
  readonly groupIds: readonly [string, string];
  readonly articleId: string;
  readonly templateId: string;
  readonly playbookId: string;
};

describeIfDatabase('config template snapshot domain policy (PostgreSQL, BA-templates-06)', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient | undefined;
  const fixtures: Fixture[] = [];

  const db = (): PrismaClient => {
    if (prisma === undefined) throw new Error('PostgreSQL client not initialized');
    return prisma;
  };

  beforeAll(() => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl! }) });
  });

  afterAll(async () => {
    const client = prisma;
    if (client === undefined) return;
    try {
      for (const fixture of [...fixtures].reverse()) {
        await client.changeLog.deleteMany({
          where: {
            entityType: { in: ['response_template', 'playbook'] },
            entityId: { in: [fixture.templateId, fixture.playbookId] },
          },
        });
        await client.playbook.deleteMany({ where: { id: fixture.playbookId } });
        await client.responseTemplate.deleteMany({ where: { id: fixture.templateId } });
        await client.knowledgeArticle.deleteMany({ where: { id: fixture.articleId } });
        await client.group.deleteMany({ where: { id: { in: [...fixture.groupIds] } } });
        await client.service.deleteMany({ where: { id: { in: [...fixture.serviceIds] } } });
        await client.serviceCategory.deleteMany({ where: { id: fixture.categoryId } });
        await client.organizationalUnit.deleteMany({ where: { id: fixture.unitId } });
        await client.user.deleteMany({ where: { id: fixture.actorId } });
      }
    } finally {
      await client.$disconnect();
    }
  });

  async function createFixture(): Promise<Fixture> {
    const suffix = `${stamp}-${fixtures.length + 1}`;
    const fixture: Fixture = {
      suffix,
      actorId: `ba06-actor-${suffix}`,
      unitId: `ba06-unit-${suffix}`,
      categoryId: `ba06-category-${suffix}`,
      serviceIds: [`ba06-service-a-${suffix}`, `ba06-service-b-${suffix}`],
      groupIds: [`ba06-group-a-${suffix}`, `ba06-group-b-${suffix}`],
      articleId: `ba06-article-${suffix}`,
      templateId: `ba06-template-${suffix}`,
      playbookId: `ba06-playbook-${suffix}`,
    };
    fixtures.push(fixture);
    await db().organizationalUnit.create({
      data: {
        id: fixture.unitId,
        name: `BA-06 unit ${suffix}`,
        type: 'SERVICE',
        distinguishedName: `CN=ba06-${suffix},OU=Integration,DC=example,DC=invalid`,
        ouPath: `/integration/ba06-${suffix}`,
      },
    });
    await db().serviceCategory.create({
      data: {
        id: fixture.categoryId,
        name: `BA-06 category ${suffix}`,
        slug: `ba06-category-${suffix}`,
      },
    });
    for (const [index, serviceId] of fixture.serviceIds.entries()) {
      await db().service.create({
        data: {
          id: serviceId,
          name: `BA-06 service ${suffix} ${index + 1}`,
          slug: `ba06-service-${suffix}-${index + 1}`,
          categoryId: fixture.categoryId,
          lifecycle: 'ACTIVE',
        },
      });
    }
    for (const [index, groupId] of fixture.groupIds.entries()) {
      await db().group.create({
        data: {
          id: groupId,
          name: `BA-06 group ${suffix} ${index + 1}`,
          key: `ba06-group-${suffix}-${index + 1}`,
          organizationalUnitId: fixture.unitId,
        },
      });
    }
    await db().user.create({
      data: {
        id: fixture.actorId,
        email: `${fixture.actorId}@example.invalid`,
        displayName: `BA-06 actor ${suffix}`,
        isLocalOnly: true,
      },
    });
    await db().knowledgeArticle.create({
      data: {
        id: fixture.articleId,
        slug: `ba06-article-${suffix}`,
        title: `BA-06 article ${suffix}`,
        body: 'Configuration snapshot reference.',
        serviceId: fixture.serviceIds[0],
        organizationalUnitId: fixture.unitId,
      },
    });
    await db().responseTemplate.create({
      data: {
        id: fixture.templateId,
        name: `BA-06 old reply ${suffix}`,
        bodyBs: 'Stari odgovor',
        kind: 'ANY',
        createdById: fixture.actorId,
        updatedById: fixture.actorId,
        services: { create: [{ serviceId: fixture.serviceIds[0] }] },
        categories: { create: [{ categoryId: fixture.categoryId }] },
        groups: { create: [{ groupId: fixture.groupIds[0] }] },
      },
    });
    await db().playbook.create({
      data: {
        id: fixture.playbookId,
        name: `BA-06 old playbook ${suffix}`,
        version: 1,
        createdById: fixture.actorId,
        updatedById: fixture.actorId,
        services: { create: [{ serviceId: fixture.serviceIds[0] }] },
        categories: { create: [{ categoryId: fixture.categoryId }] },
        steps: {
          create: [{
            stepKey: 'verify_access',
            position: 0,
            title: 'Old access check',
            required: true,
            knowledgeArticleId: fixture.articleId,
            responseTemplateId: fixture.templateId,
          }],
        },
      },
    });
    return fixture;
  }

  function snapshotFor(fixture: Fixture, stepTitle: string): ConfigSnapshot {
    return createConfigSnapshotFixture({
      templates: {
        responseTemplates: [
          {
            id: fixture.templateId,
            name: `BA-06 restored reply ${fixture.suffix}`,
            bodyBs: 'Ažuriran odgovor {ticketNumber}',
            bodyEn: 'Updated reply {ticketNumber}',
            kind: 'REPLY',
            tags: ['support'],
            isActive: true,
            deletedAt: null,
            scope: {
              serviceIds: [fixture.serviceIds[1]],
              categoryIds: [fixture.categoryId],
              groupIds: [fixture.groupIds[1]],
            },
          },
        ],
        playbooks: [
          {
            id: fixture.playbookId,
            name: `BA-06 restored playbook ${fixture.suffix}`,
            description: 'Restored playbook definition.',
            isActive: true,
            version: 1,
            deletedAt: null,
            scope: {
              serviceIds: [fixture.serviceIds[1]],
              categoryIds: [fixture.categoryId],
            },
            steps: [
              {
                stepKey: 'verify_access',
                position: 0,
                title: stepTitle,
                instructions: 'Verify access and record the result.',
                required: true,
                knowledgeArticleId: fixture.articleId,
                responseTemplateId: fixture.templateId,
              },
              {
                stepKey: 'notify_user',
                position: 1,
                title: 'Notify the user',
                instructions: 'Send a confirmation.',
                required: false,
                knowledgeArticleId: null,
                responseTemplateId: null,
              },
            ],
          },
        ],
      },
    });
  }

  it('atomically restores scopes and steps, logs actor/reason, and increments the target revision monotonically', async () => {
    const fixture = await createFixture();
    const reason = `Restore template config ${fixture.suffix}`;
    await db().$transaction((transaction) =>
      applyTemplatesSnapshot(transaction, snapshotFor(fixture, 'Verify restored access'), {
        reason,
        actorUserId: fixture.actorId,
      }),
    );

    const [template, playbook, logs] = await Promise.all([
      db().responseTemplate.findUniqueOrThrow({
        where: { id: fixture.templateId },
        include: { services: true, categories: true, groups: true },
      }),
      db().playbook.findUniqueOrThrow({
        where: { id: fixture.playbookId },
        include: { services: true, categories: true, steps: { orderBy: { position: 'asc' } } },
      }),
      db().changeLog.findMany({
        where: { entityId: { in: [fixture.templateId, fixture.playbookId] }, reason, actorUserId: fixture.actorId },
      }),
    ]);
    expect(template).toMatchObject({
      name: `BA-06 restored reply ${fixture.suffix}`,
      services: [{ serviceId: fixture.serviceIds[1] }],
      categories: [{ categoryId: fixture.categoryId }],
      groups: [{ groupId: fixture.groupIds[1] }],
    });
    expect(playbook).toMatchObject({
      name: `BA-06 restored playbook ${fixture.suffix}`,
      version: 2,
      services: [{ serviceId: fixture.serviceIds[1] }],
      categories: [{ categoryId: fixture.categoryId }],
      steps: [{
        stepKey: 'verify_access',
        position: 0,
        title: 'Verify restored access',
        knowledgeArticleId: fixture.articleId,
        responseTemplateId: fixture.templateId,
      }, {
        stepKey: 'notify_user',
        position: 1,
        title: 'Notify the user',
        instructions: 'Send a confirmation.',
        required: false,
        knowledgeArticleId: null,
        responseTemplateId: null,
      }],
    });
    expect(logs.map(({ entityType }) => entityType).sort()).toEqual(['playbook', 'response_template']);

    await db().$transaction((transaction) =>
      applyTemplatesSnapshot(transaction, snapshotFor(fixture, 'Verify second restore'), {
        reason: `Second restore ${fixture.suffix}`,
        actorUserId: fixture.actorId,
      }),
    );
    const monotonic = await db().playbook.findUniqueOrThrow({ where: { id: fixture.playbookId } });
    expect(monotonic.version).toBe(3);
  });

  it('rejects foreign scope references without partially applying template headers or audit rows', async () => {
    const fixture = await createFixture();
    const [baselineTemplate, baselinePlaybook] = await Promise.all([
      db().responseTemplate.findUniqueOrThrow({ where: { id: fixture.templateId } }),
      db().playbook.findUniqueOrThrow({
        where: { id: fixture.playbookId },
        include: { services: true, categories: true, steps: { orderBy: { position: 'asc' } } },
      }),
    ]);
    const invalid = snapshotFor(fixture, 'Must not apply');
    const invalidSnapshot: ConfigSnapshot = {
      ...invalid,
      templates: {
        ...invalid.templates!,
        responseTemplates: invalid.templates!.responseTemplates.map((template) => ({
          ...template,
          name: `Must not be written ${fixture.suffix}`,
          scope: { serviceIds: ['missing-service'], categoryIds: [], groupIds: [] },
        })),
      },
    };

    await expect(db().$transaction((transaction) =>
      applyTemplatesSnapshot(transaction, invalidSnapshot, {
        reason: `Reject invalid scope ${fixture.suffix}`,
        actorUserId: fixture.actorId,
      }),
    )).rejects.toMatchObject({ code: configVersioningErrorCodes.templatesInvariantViolation });

    const [afterTemplate, afterPlaybook, logs] = await Promise.all([
      db().responseTemplate.findUniqueOrThrow({ where: { id: fixture.templateId } }),
      db().playbook.findUniqueOrThrow({
        where: { id: fixture.playbookId },
        include: { services: true, categories: true, steps: { orderBy: { position: 'asc' } } },
      }),
      db().changeLog.count({ where: { entityId: { in: [fixture.templateId, fixture.playbookId] } } }),
    ]);
    expect(afterTemplate.name).toBe(baselineTemplate.name);
    expect(afterTemplate.bodyBs).toBe(baselineTemplate.bodyBs);
    expect(afterPlaybook).toMatchObject({
      name: baselinePlaybook.name,
      version: baselinePlaybook.version,
      services: baselinePlaybook.services,
      categories: baselinePlaybook.categories,
      steps: baselinePlaybook.steps,
    });
    expect(logs).toBe(0);
  });
});
