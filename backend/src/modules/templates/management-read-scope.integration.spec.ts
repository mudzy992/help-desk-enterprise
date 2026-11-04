import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { permissionKeys } from '../authorization/authorization.constants';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { PlaybooksService } from './playbooks/playbooks.service';
import { ResponseTemplatesService } from './response-templates.service';

const databaseUrl = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = databaseUrl ? describe : describe.skip;
const stamp = `${Date.now()}-${process.pid}`;
const foreignCount = 1001;
const createdAt = new Date('2026-10-01T00:00:00.000Z');
const categoryId = `templates-scope-category-${stamp}`;
const allowedServiceId = `templates-scope-allowed-${stamp}`;
const foreignServiceId = `templates-scope-foreign-${stamp}`;
const foreignTemplateIds = Array.from({ length: foreignCount }, (_, index) =>
  `templates-scope-foreign-${stamp}-${String(index).padStart(4, '0')}`,
);
const allowedTemplateId = `templates-scope-allowed-${stamp}`;
const templateIds = [...foreignTemplateIds, allowedTemplateId];
const foreignPlaybookIds = Array.from({ length: foreignCount }, (_, index) =>
  `playbook-scope-foreign-${stamp}-${String(index).padStart(4, '0')}`,
);
const allowedPlaybookId = `playbook-scope-allowed-${stamp}`;
const playbookIds = [...foreignPlaybookIds, allowedPlaybookId];

const managerContext: AuthorizationContext = {
  subjectId: `templates-scope-manager-${stamp}`,
  isLocalOnly: false,
  isSuperAdmin: false,
  assignments: [
    {
      roleKey: 'ADMIN',
      permissionKeys: [permissionKeys.ticketTemplatesManage],
      organizationalUnitId: null,
      organizationalUnitPath: null,
      serviceId: allowedServiceId,
    },
  ],
};

describeIfDatabase('templates management read isolation (PostgreSQL integration, BA-templates-01)', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient | undefined;

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl! }) });
    await prisma.serviceCategory.create({
      data: { id: categoryId, name: `Templates scope ${stamp}`, slug: `templates-scope-${stamp}` },
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
        ...foreignTemplateIds.map((templateId) => ({ templateId, serviceId: foreignServiceId })),
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
        ...foreignPlaybookIds.map((playbookId) => ({ playbookId, serviceId: foreignServiceId })),
        { playbookId: allowedPlaybookId, serviceId: allowedServiceId },
      ],
    });
  });

  afterAll(async () => {
    if (prisma === undefined) return;
    await prisma.playbook.deleteMany({ where: { id: { in: playbookIds } } });
    await prisma.responseTemplate.deleteMany({ where: { id: { in: templateIds } } });
    await prisma.service.deleteMany({ where: { id: { in: [allowedServiceId, foreignServiceId] } } });
    await prisma.serviceCategory.deleteMany({ where: { id: categoryId } });
    await prisma.$disconnect();
  });

  it('applies service scope before the 1000-row take for template and playbook lists', async () => {
    prisma ??= new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl! }) });
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

    const visibleTemplates = await templates.listManaged({}, { actorUserId: managerContext.subjectId });
    const visiblePlaybooks = await playbooks.list({}, { actorUserId: managerContext.subjectId });

    expect(visibleTemplates.map((template) => template.id)).toEqual([allowedTemplateId]);
    expect(visiblePlaybooks.map((playbook) => playbook.id)).toEqual([allowedPlaybookId]);

    await expect(
      templates.get(foreignTemplateIds[0]!, { actorUserId: managerContext.subjectId }),
    ).rejects.toMatchObject({ code: 'TEMPLATE_NOT_FOUND' });
    await expect(
      playbooks.get(foreignPlaybookIds[0]!, { actorUserId: managerContext.subjectId }),
    ).rejects.toMatchObject({ code: 'PLAYBOOK_NOT_FOUND' });
  });
});
