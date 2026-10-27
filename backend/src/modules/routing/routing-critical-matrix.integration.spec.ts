import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { defaultRoutingConfiguration } from './routing.constants';
import { listRoutingRules } from './list-routing-rules';
import { resolveTicketRouting } from './resolve-ticket-routing';
import { updateRoutingRule } from './update-routing-rule';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

/**
 * BA-routing-11: mandatory generated-Prisma/PostgreSQL evidence for the
 * routing invariants whose focused unit suites use the in-memory harness.
 * The isolated-integration runner gives this suite its own migrated database.
 */
describeIfDatabase('routing critical PostgreSQL matrix', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient;
  const stamp = `${Date.now()}-${process.pid}`;
  const rootId = `routing-root-${stamp}`;
  const scopedId = `routing-scoped-${stamp}`;
  const foreignId = `routing-foreign-${stamp}`;
  const serviceId = `routing-service-${stamp}`;
  const firstGroupId = `routing-group-a-${stamp}`;
  const secondGroupId = `routing-group-b-${stamp}`;
  const categoryId = `routing-category-${stamp}`;

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    await prisma.serviceCategory.create({
      data: { id: categoryId, name: `Routing matrix ${stamp}`, slug: `routing-matrix-${stamp}` },
    });
    await prisma.organizationalUnit.create({
      data: {
        id: rootId,
        name: 'Routing matrix root',
        type: 'COMPANY',
        distinguishedName: `OU=Routing matrix ${stamp}`,
        ouPath: `/Routing matrix ${stamp}`,
      },
    });
    await prisma.organizationalUnit.createMany({
      data: [
        {
          id: scopedId,
          name: 'Scoped',
          type: 'DEPARTMENT',
          distinguishedName: `OU=Scoped,OU=Routing matrix ${stamp}`,
          ouPath: `/Routing matrix ${stamp}/Scoped`,
          parentId: rootId,
        },
        {
          id: foreignId,
          name: 'Foreign',
          type: 'DEPARTMENT',
          distinguishedName: `OU=Foreign,OU=Routing matrix ${stamp}`,
          ouPath: `/Routing matrix ${stamp}/Foreign`,
          parentId: rootId,
        },
      ],
    });
    await prisma.group.createMany({
      data: [
        { id: firstGroupId, key: `routing-a-${stamp}`, name: 'Routing A', organizationalUnitId: scopedId },
        { id: secondGroupId, key: `routing-b-${stamp}`, name: 'Routing B', organizationalUnitId: scopedId },
      ],
    });
    await prisma.service.create({
      data: { id: serviceId, name: `Routing service ${stamp}`, slug: `routing-service-${stamp}`, categoryId },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('proves scoped keyset pages exclude foreign rows and preserve the exact total', async () => {
    await prisma.routingRule.createMany({
      data: [
        { originUnitId: rootId, serviceId, groupId: firstGroupId },
        { originUnitId: scopedId, serviceId, groupId: firstGroupId },
        { originUnitId: foreignId, serviceId, groupId: firstGroupId },
      ],
    });

    const assignments = [{
      organizationalUnitPath: `/Routing matrix ${stamp}/Scoped`,
      serviceId,
    }];
    const page = await listRoutingRules(prisma as never, { take: 1 }, assignments);

    expect(page.total).toBe(1);
    expect(page.items.map((rule) => rule.originUnitId)).toEqual([scopedId]);
    expect(page.hasMore).toBe(false);
  });

  it('resolves a deep origin through a bounded parent fallback on generated Prisma', async () => {
    const units = Array.from({ length: 120 }, (_, index) => ({
      id: `routing-deep-${stamp}-${index.toString().padStart(3, '0')}`,
      name: `Deep ${index}`,
      type: 'DEPARTMENT' as const,
      distinguishedName: `OU=Deep ${index},OU=Routing matrix ${stamp}`,
      ouPath: `/Routing matrix ${stamp}/Deep/${index.toString().padStart(3, '0')}`,
      parentId: rootId,
    }));
    await prisma.organizationalUnit.createMany({ data: units });
    const origin = units[units.length - 1]!;

    const result = await resolveTicketRouting(
      prisma as never,
      { originUnitId: origin.id, serviceId },
      defaultRoutingConfiguration,
    );

    expect(result).toMatchObject({
      outcome: 'PARENT_FALLBACK',
      originUnitId: origin.id,
      matchedOriginUnitId: rootId,
      groupId: firstGroupId,
      fallbackDepth: 1,
    });
  });

  it('allows exactly one concurrent optimistic update and records only its change', async () => {
    const rule = await prisma.routingRule.findUniqueOrThrow({
      where: { originUnitId_serviceId: { originUnitId: scopedId, serviceId } },
    });
    const command = (groupId: string) => updateRoutingRule(
      prisma as never,
      rule.id,
      {
        groupId,
        expectedUpdatedAt: rule.updatedAt.toISOString(),
        reason: `Routing matrix concurrent update to ${groupId}`,
      },
      { actorUserId: null },
      defaultRoutingConfiguration,
    );

    const outcomes = await Promise.allSettled([
      command(firstGroupId),
      command(secondGroupId),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toEqual([
      expect.objectContaining({ reason: expect.objectContaining({ code: 'ROUTING_RULE_CONFLICT' }) }),
    ]);
    expect(await prisma.changeLog.count({
      where: { entityType: 'routing_rule', entityId: rule.id },
    })).toBe(1);
  });
});
