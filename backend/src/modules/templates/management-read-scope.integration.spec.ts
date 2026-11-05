import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { permissionKeys } from '../authorization/authorization.constants';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { PlaybooksService } from './playbooks/playbooks.service';
import { ResponseTemplatesService } from './response-templates.service';
import { loadPlaybookCandidates } from './ticket-playbooks/attach-playbook-to-ticket';

const databaseUrl = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = databaseUrl ? describe : describe.skip;
const stamp = `${Date.now()}-${process.pid}`;
const foreignCount = 1001;
const visibleCount = 1001;
const pickerCount = 201;
const createdAt = new Date('2026-10-01T00:00:00.000Z');
const categoryId = `templates-scope-category-${stamp}`;
const allowedServiceId = `templates-scope-allowed-${stamp}`;
const foreignServiceId = `templates-scope-foreign-${stamp}`;
const foreignTemplateIds = Array.from(
  { length: foreignCount },
  (_, index) => `templates-scope-foreign-${stamp}-${String(index).padStart(4, '0')}`,
);
const visibleTemplateIds = Array.from(
  { length: visibleCount },
  (_, index) => `templates-scope-visible-${stamp}-${String(index).padStart(4, '0')}`,
);
const pickerTemplateIds = Array.from(
  { length: pickerCount },
  (_, index) => `templates-scope-picker-${stamp}-${String(index).padStart(4, '0')}`,
);
const allowedTemplateId = `templates-scope-allowed-${stamp}`;
const templateIds = [...foreignTemplateIds, ...visibleTemplateIds, ...pickerTemplateIds, allowedTemplateId];
const foreignPlaybookIds = Array.from(
  { length: foreignCount },
  (_, index) => `playbook-scope-foreign-${stamp}-${String(index).padStart(4, '0')}`,
);
const visiblePlaybookIds = Array.from(
  { length: visibleCount },
  (_, index) => `playbook-scope-visible-${stamp}-${String(index).padStart(4, '0')}`,
);
const allowedPlaybookId = `playbook-scope-allowed-${stamp}`;
const playbookIds = [...foreignPlaybookIds, ...visiblePlaybookIds, allowedPlaybookId];

const managerContext: AuthorizationContext = {
  subjectId: `templates-scope-manager-${stamp}`,
  isLocalOnly: false,
  isSuperAdmin: false,
  assignments: [
    {
      roleKey: 'ADMIN',
      permissionKeys: [permissionKeys.ticketTemplatesManage, permissionKeys.ticketTemplatesUse],
      organizationalUnitId: null,
      organizationalUnitPath: null,
      serviceId: allowedServiceId,
    },
  ],
};

describeIfDatabase('templates management scope and pagination (PostgreSQL integration, BA-templates-09)', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient | undefined;

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl! }),
    });
    await prisma.serviceCategory.create({
      data: {
        id: categoryId,
        name: `Templates scope ${stamp}`,
        slug: `templates-scope-${stamp}`,
      },
    });
    await prisma.service.createMany({
      data: [
        {
          id: allowedServiceId,
          name: `Allowed templates service ${stamp}`,
          slug: `templates-allowed-${stamp}`,
          categoryId,
          createdAt,
          updatedAt: createdAt,
        },
        {
          id: foreignServiceId,
          name: `Foreign templates service ${stamp}`,
          slug: `templates-foreign-${stamp}`,
          categoryId,
          createdAt,
          updatedAt: createdAt,
        },
      ],
    });

    await prisma.responseTemplate.createMany({
      data: [
        ...foreignTemplateIds.map((id, index) => ({
          id,
          name: `a-foreign-template-${String(index).padStart(4, '0')}-${stamp}`,
          bodyBs: `Foreign instructions ${index}`,
          kind: 'REPLY' as const,
          createdAt,
          updatedAt: createdAt,
        })),
        ...visibleTemplateIds.map((id, index) => ({
          id,
          name: `b-visible-template-${stamp}`,
          bodyBs: `Visible instructions ${index}`,
          kind: 'REPLY' as const,
          createdAt,
          updatedAt: createdAt,
        })),
        ...pickerTemplateIds.map((id, index) => ({
          id,
          name: `c-picker-template-${stamp}`,
          bodyBs: `Picker instructions ${index}`,
          kind: 'REPLY' as const,
          createdAt,
          updatedAt: createdAt,
        })),
        {
          id: allowedTemplateId,
          name: `z-allowed-template-${stamp}`,
          bodyBs: 'Allowed instructions',
          kind: 'REPLY' as const,
          createdAt,
          updatedAt: createdAt,
        },
      ],
    });
    await prisma.responseTemplateService.createMany({
      data: [
        ...foreignTemplateIds.map((templateId) => ({
          templateId,
          serviceId: foreignServiceId,
        })),
        ...visibleTemplateIds.map((templateId) => ({
          templateId,
          serviceId: allowedServiceId,
        })),
        { templateId: allowedTemplateId, serviceId: allowedServiceId },
      ],
    });

    await prisma.playbook.createMany({
      data: [
        ...foreignPlaybookIds.map((id, index) => ({
          id,
          name: `a-foreign-playbook-${String(index).padStart(4, '0')}-${stamp}`,
          createdAt,
          updatedAt: createdAt,
        })),
        ...visiblePlaybookIds.map((id) => ({
          id,
          name: `b-visible-playbook-${stamp}`,
          createdAt,
          updatedAt: createdAt,
        })),
        {
          id: allowedPlaybookId,
          name: `z-allowed-playbook-${stamp}`,
          createdAt,
          updatedAt: createdAt,
        },
      ],
    });
    await prisma.playbookService.createMany({
      data: [
        ...foreignPlaybookIds.map((playbookId) => ({
          playbookId,
          serviceId: foreignServiceId,
        })),
        ...visiblePlaybookIds.map((playbookId) => ({
          playbookId,
          serviceId: allowedServiceId,
        })),
        { playbookId: allowedPlaybookId, serviceId: allowedServiceId },
      ],
    });
  });

  afterAll(async () => {
    if (prisma === undefined) return;
    await prisma.playbook.deleteMany({ where: { id: { in: playbookIds } } });
    await prisma.responseTemplate.deleteMany({
      where: { id: { in: templateIds } },
    });
    await prisma.service.deleteMany({
      where: { id: { in: [allowedServiceId, foreignServiceId] } },
    });
    await prisma.serviceCategory.deleteMany({ where: { id: categoryId } });
    await prisma.$disconnect();
  });

  it('paginates every visible management, picker and ticket-candidate row beyond legacy limits', async () => {
    prisma ??= new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl! }),
    });
    const authorization = { loadBySubjectId: async () => managerContext };
    const configuration = {
      load: async () => ({
        templatesEnabled: true,
        playbooksEnabled: true,
        autoAttach: true,
        requiredStepsOnResolve: 'warn' as const,
      }),
    };
    const templates = new ResponseTemplatesService(
      prisma as never,
      authorization as never,
      {} as never,
      {} as never,
      configuration as never,
    );
    const playbooks = new PlaybooksService(prisma as never, authorization as never, configuration as never);
    const actor = { actorUserId: managerContext.subjectId };

    let templatePage = await templates.listManaged({ take: 100 }, actor);
    expect(templatePage.total).toBe(visibleTemplateIds.length + 1);
    expect(templatePage.hasMore).toBe(true);
    const managedTemplateIds = [...templatePage.items.map((item) => item.id)];
    while (templatePage.nextCursor !== null) {
      templatePage = await templates.listManaged({ take: 100, cursor: templatePage.nextCursor }, actor);
      managedTemplateIds.push(...templatePage.items.map((item) => item.id));
    }
    expect(templatePage.hasMore).toBe(false);
    expect(managedTemplateIds).toHaveLength(visibleTemplateIds.length + 1);
    expect(new Set(managedTemplateIds).size).toBe(managedTemplateIds.length);
    expect(managedTemplateIds.sort()).toEqual([...visibleTemplateIds, allowedTemplateId].sort());

    let playbookPage = await playbooks.list({ take: 100 }, actor);
    expect(playbookPage.total).toBe(visiblePlaybookIds.length + 1);
    expect(playbookPage.hasMore).toBe(true);
    const managedPlaybookIds = [...playbookPage.items.map((item) => item.id)];
    while (playbookPage.nextCursor !== null) {
      playbookPage = await playbooks.list({ take: 100, cursor: playbookPage.nextCursor }, actor);
      managedPlaybookIds.push(...playbookPage.items.map((item) => item.id));
    }
    expect(playbookPage.hasMore).toBe(false);
    expect(managedPlaybookIds).toHaveLength(visiblePlaybookIds.length + 1);
    expect(new Set(managedPlaybookIds).size).toBe(managedPlaybookIds.length);
    expect(managedPlaybookIds.sort()).toEqual([...visiblePlaybookIds, allowedPlaybookId].sort());

    let pickerPage = await templates.listForPicker({ take: 100 }, actor);
    expect(pickerPage.hasMore).toBe(true);
    const pickerIds = [...pickerPage.items.map((item) => item.id)];
    while (pickerPage.nextCursor !== null) {
      pickerPage = await templates.listForPicker({ take: 100, cursor: pickerPage.nextCursor }, actor);
      pickerIds.push(...pickerPage.items.map((item) => item.id));
    }
    expect(pickerPage.hasMore).toBe(false);
    expect(pickerIds).toHaveLength(pickerCount);
    expect(new Set(pickerIds).size).toBe(pickerCount);
    expect(pickerIds.sort()).toEqual([...pickerTemplateIds].sort());

    let candidatePage = await loadPlaybookCandidates(
      prisma as never,
      {
        ticketId: `fixture-${stamp}`,
        serviceId: allowedServiceId,
        categoryId,
      },
      { take: 100 },
    );
    expect(candidatePage.hasMore).toBe(true);
    const candidateIds = [...candidatePage.items.map((item) => item.id)];
    while (candidatePage.nextCursor !== null) {
      candidatePage = await loadPlaybookCandidates(
        prisma as never,
        {
          ticketId: `fixture-${stamp}`,
          serviceId: allowedServiceId,
          categoryId,
        },
        { take: 100, cursor: candidatePage.nextCursor },
      );
      candidateIds.push(...candidatePage.items.map((item) => item.id));
    }
    expect(candidatePage.hasMore).toBe(false);
    expect(candidateIds).toHaveLength(playbookIds.length);
    expect(new Set(candidateIds).size).toBe(playbookIds.length);
    expect(candidateIds.sort()).toEqual([...playbookIds].sort());

    await expect(templates.get(foreignTemplateIds[0]!, actor)).rejects.toMatchObject({
      code: 'TEMPLATE_NOT_FOUND',
    });
    await expect(playbooks.get(foreignPlaybookIds[0]!, actor)).rejects.toMatchObject({
      code: 'PLAYBOOK_NOT_FOUND',
    });
  });
});
