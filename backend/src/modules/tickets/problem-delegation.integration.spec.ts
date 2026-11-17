import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { assertProblemDelegation } from './problem-delegation';
import { loadAccessibleTicket } from './load-accessible-ticket';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

/** Real problem/ticket/link/role rows; the guard itself is not mocked. */
describeIfDatabase('problem delegation authorization (BA-problems-05, integration)', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient;
  let managerId: string;
  let outsiderId: string;
  let plainUserId: string;
  let problemId: string;
  let reopenedProblemId: string;
  let foreignTicketId: string;
  let confidentialTicketId: string;
  let unlinkedTicketId: string;
  let onlyOnReopenedTicketId: string;
  let problemGroupId: string;
  const stamp = `${Date.now()}-${process.pid}`;
  const loader = {
    loadBySubjectId: async (subjectId: string) => ({
      subjectId,
      isSuperAdmin: false,
      isLocalOnly: false,
      assignments: [],
    }),
  };

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    const inside = await prisma.organizationalUnit.create({
      data: { name: `Delegation inside ${stamp}`, type: 'DIRECTORATE', distinguishedName: `OU=DelegationInside${stamp}`, ouPath: `/delegation-${stamp}` },
    });
    const outside = await prisma.organizationalUnit.create({
      data: { name: `Delegation outside ${stamp}`, type: 'DIRECTORATE', distinguishedName: `OU=DelegationOutside${stamp}`, ouPath: `/delegation-outside-${stamp}` },
    });
    const permissionKeysToSeed = ['problem.read', 'problem.manage', 'problem.close'];
    const permissions = await Promise.all(
      permissionKeysToSeed.map((key) =>
        prisma.permission.upsert({
          where: { key },
          update: {},
          create: { key, description: `${key} (integration fixture)` },
          select: { id: true },
        }),
      ),
    );
    const role = await prisma.role.create({
      data: { key: `PROBLEM_DELEGATION_${stamp}`, name: `Problem delegation ${stamp}`, isSystem: false },
    });
    await prisma.rolePermission.createMany({ data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })) });
    managerId = (await prisma.user.create({ data: { email: `delegee-${stamp}@example.test`, displayName: 'Delegee', organizationalUnitId: inside.id } })).id;
    outsiderId = (await prisma.user.create({ data: { email: `outsider-${stamp}@example.test`, displayName: 'Outsider', organizationalUnitId: outside.id } })).id;
    plainUserId = (await prisma.user.create({ data: { email: `plain-${stamp}@example.test`, displayName: 'Plain' } })).id;
    await prisma.userRole.createMany({
      data: [
        { userId: managerId, roleId: role.id, organizationalUnitId: inside.id },
        { userId: outsiderId, roleId: role.id, organizationalUnitId: outside.id },
      ],
    });
    const problemGroup = await prisma.group.create({
      data: { key: `PG-DELEGATION-${stamp}`, name: `Problem group ${stamp}`, organizationalUnitId: inside.id, isProblemGroup: true },
    });
    problemGroupId = problemGroup.id;
    await prisma.groupMember.create({ data: { groupId: problemGroup.id, userId: managerId } });

    const category = await prisma.serviceCategory.create({ data: { name: `Delegation ${stamp}`, slug: `delegation-cat-${stamp}` } });
    const service = await prisma.service.create({ data: { name: `Delegation ${stamp}`, slug: `delegation-svc-${stamp}`, categoryId: category.id, lifecycle: 'ACTIVE' } });
    const form = await prisma.formVersion.create({ data: { serviceId: service.id, version: 1, schema: {} } });
    const requesterId = (await prisma.user.create({ data: { email: `delegation-requester-${stamp}@example.test`, displayName: 'Requester' } })).id;
    const sequence = (Date.now() % 1_000_000_000) + 10_000;
    problemId = (await prisma.problem.create({
      data: { sequence, title: `Delegation ${stamp}`, description: 'Integration', status: 'RESOLVED', organizationalUnitId: inside.id, groupId: problemGroup.id },
    })).id;
    reopenedProblemId = (await prisma.problem.create({
      data: { sequence: sequence + 1, title: `Delegation reopened ${stamp}`, description: 'Integration', status: 'INVESTIGATING', organizationalUnitId: inside.id, groupId: problemGroup.id },
    })).id;
    const createTicket = async (originUnitId: string, isConfidential: boolean, label: string) =>
      (await prisma.ticket.create({
        data: {
          ticketNumber: `DELEGATION-${label}-${stamp}`, title: `Ticket ${label}`, description: 'Integration', formData: {},
          priority: 'LOW', impact: 'LOW', urgency: 'LOW', status: 'IN_PROGRESS', isConfidential,
          serviceId: service.id, formVersionId: form.id, requesterId, originUnitId,
        } as never,
        select: { id: true },
      })).id;
    foreignTicketId = await createTicket(outside.id, false, 'FOREIGN');
    confidentialTicketId = await createTicket(outside.id, true, 'CONFIDENTIAL');
    unlinkedTicketId = await createTicket(outside.id, false, 'UNLINKED');
    onlyOnReopenedTicketId = await createTicket(outside.id, false, 'REOPENED');
    await prisma.problemTicket.createMany({
      data: [
        { problemId, ticketId: foreignTicketId },
        { problemId, ticketId: confidentialTicketId },
        { problemId: reopenedProblemId, ticketId: onlyOnReopenedTicketId },
      ],
    });
  });

  afterAll(async () => { await prisma.$disconnect(); });

  const guard = (ticketId: string, actorUserId: string, targetProblemId = problemId) =>
    assertProblemDelegation(prisma as never, { problemId: targetProblemId, ticketId, actorUserId });

  it('accepts the current manager of the problem group for a linked ticket in another OU', async () => {
    await expect(guard(foreignTicketId, managerId)).resolves.toBeUndefined();
  });

  it('rejects tickets that are not linked to that problem', async () => {
    await expect(guard(unlinkedTicketId, managerId)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(guard(onlyOnReopenedTicketId, managerId)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('rejects a problem that left RESOLVED', async () => {
    await expect(guard(onlyOnReopenedTicketId, managerId, reopenedProblemId)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('rejects users without the problem permissions or the problem-group membership', async () => {
    await expect(guard(foreignTicketId, plainUserId)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(guard(foreignTicketId, outsiderId)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('stops delegating as soon as the group membership is revoked', async () => {
    const membership = await prisma.groupMember.findFirst({ where: { groupId: problemGroupId, userId: managerId } });
    await prisma.groupMember.delete({ where: { id: membership!.id } });
    try {
      await expect(guard(foreignTicketId, managerId)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    } finally {
      await prisma.groupMember.create({ data: { groupId: problemGroupId, userId: managerId } });
    }
  });

  it('gives the delegated write path staff access to the linked foreign ticket', async () => {
    const loaded = await loadAccessibleTicket(prisma as never, loader as never, foreignTicketId, {
      actorUserId: managerId,
      problemDelegation: { problemId },
    });
    expect(loaded.access.visibility).toBe('staff');
  });

  it('never lets the delegation reach a confidential ticket without own access', async () => {
    await expect(loadAccessibleTicket(prisma as never, loader as never, confidentialTicketId, {
      actorUserId: managerId,
      problemDelegation: { problemId },
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('fails closed when the delegated ticket is not linked to the named problem', async () => {
    await expect(loadAccessibleTicket(prisma as never, loader as never, unlinkedTicketId, {
      actorUserId: managerId,
      problemDelegation: { problemId },
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
