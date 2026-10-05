import { permissionKeys } from '../authorization/authorization.constants';
import type {
  AuthorizationAssignment,
  AuthorizationContext,
} from '../authorization/authorization.types';
import { TemplatesError } from './templates.error';
import { ResponseTemplatesService } from './response-templates.service';

jest.mock('../tickets/load-accessible-ticket', () => ({ loadAccessibleTicket: jest.fn() }));
jest.mock('./assert-response-template-usable', () => ({ assertResponseTemplateUsable: jest.fn() }));
jest.mock('./build-template-variables', () => ({
  buildTemplateVariables: jest.fn(),
  sampleTemplateVariables: jest.fn(() => ({ ticketNumber: 'SAMPLE-1' })),
}));

import { loadAccessibleTicket } from '../tickets/load-accessible-ticket';
import { assertResponseTemplateUsable } from './assert-response-template-usable';
import { buildTemplateVariables, sampleTemplateVariables } from './build-template-variables';

const loadTicketMock = loadAccessibleTicket as jest.Mock;
const assertUsableMock = assertResponseTemplateUsable as jest.Mock;
const buildVariablesMock = buildTemplateVariables as jest.Mock;
const sampleVariablesMock = sampleTemplateVariables as jest.Mock;

type Row = {
  id: string;
  name: string;
  bodyBs: string;
  bodyEn: string | null;
  kind: 'REPLY' | 'INTERNAL' | 'ANY';
  tags: string[];
  isActive: boolean;
  ownerUserId: string | null;
  usageCount: number;
  lastUsedAt: Date | null;
  updatedAt: Date;
  services: { serviceId: string }[];
  categories: { categoryId: string }[];
  groups: { groupId: string }[];
};

const row = (overrides: Partial<Row> = {}): Row => ({
  id: 'template-1',
  name: 'Zdravo',
  bodyBs: 'Zdravo {{requesterFirstName}},',
  bodyEn: null,
  kind: 'REPLY',
  tags: [],
  isActive: true,
  ownerUserId: null,
  usageCount: 0,
  lastUsedAt: null,
  updatedAt: new Date('2026-01-02T03:04:05.000Z'),
  services: [],
  categories: [],
  groups: [],
  ...overrides,
});

const assignment = (keys: readonly string[], serviceId: string | null = null): AuthorizationAssignment => ({
  roleKey: 'ADMIN',
  permissionKeys: keys,
  organizationalUnitId: null,
  organizationalUnitPath: null,
  serviceId,
});

const contextFor = (
  keys: readonly string[],
  options: { readonly isSuperAdmin?: boolean; readonly serviceId?: string | null } = {},
): AuthorizationContext => ({
  subjectId: 'actor-1',
  isLocalOnly: false,
  isSuperAdmin: options.isSuperAdmin ?? false,
  assignments: [assignment(keys, options.serviceId ?? null)],
});

const ticket = {
  id: 'ticket-1',
  ticketNumber: 'HD-2026-0001',
  title: 'Ne radi štampač',
  description: 'Opis',
  status: 'OPEN',
  priority: 'NORMAL',
  impact: 'MEDIUM',
  urgency: 'MEDIUM',
  classification: 'INTERNAL',
  isConfidential: false,
  formData: {},
  originUnitId: 'unit-1',
  serviceId: 'service-1',
  formVersionId: 'form-1',
  requesterId: 'requester-1',
  assignedGroupId: 'group-1',
  assignedUserId: null,
  parentTicketId: null,
  mergedIntoTicketId: null,
  reopenedFromTicketId: null,
  closeCodeId: null,
  resolutionNote: null,
  resolvedAt: null,
  closedAt: null,
  archivedAt: null,
  waitingForUserEnteredAt: null,
  waitingForUserReminderSentAt: null,
  firstResponseAt: null,
};

type HarnessPrisma = {
  readonly responseTemplate: {
    readonly findMany: jest.Mock;
    readonly findFirst: jest.Mock;
    readonly create: jest.Mock;
    readonly update: jest.Mock;
  };
  readonly responseTemplateService: { readonly deleteMany: jest.Mock };
  readonly responseTemplateCategory: { readonly deleteMany: jest.Mock };
  readonly responseTemplateGroup: { readonly deleteMany: jest.Mock };
  readonly service: { readonly count: jest.Mock; readonly findUnique: jest.Mock };
  readonly serviceCategory: { readonly count: jest.Mock };
  readonly group: { readonly count: jest.Mock };
  readonly user: { readonly findUnique: jest.Mock };
  readonly changeLog: { readonly create: jest.Mock };
  readonly $transaction: jest.Mock;
};

type HarnessOptions = {
  readonly context?: AuthorizationContext | null;
  readonly templatesEnabled?: boolean;
  readonly requesterLocale?: string | null;
};

function createHarness(options: HarnessOptions = {}) {
  const changeLogs: Record<string, unknown>[] = [];
  const authorizationContext: AuthorizationContext | null =
    options.context === undefined
      ? contextFor([permissionKeys.ticketTemplatesUse, permissionKeys.ticketTemplatesManage])
      : options.context;

  const prisma: HarnessPrisma = {
    responseTemplate: {
      findMany: jest.fn(async (_args: unknown): Promise<Row[]> => []),
      findFirst: jest.fn(async (_args: unknown): Promise<Row | null> => null),
      create: jest.fn(async (_args: unknown): Promise<Row> => row()),
      update: jest.fn(async (_args: unknown): Promise<Row> => row()),
    },
    responseTemplateService: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    responseTemplateCategory: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    responseTemplateGroup: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    service: {
      count: jest.fn(async () => 1),
      findUnique: jest.fn(async () => ({ categoryId: 'category-1' })),
    },
    serviceCategory: { count: jest.fn(async () => 1) },
    group: { count: jest.fn(async () => 1) },
    user: { findUnique: jest.fn(async () => ({ preferredLocale: options.requesterLocale ?? 'bs' })) },
    changeLog: {
      create: jest.fn(async (args: { data: Record<string, unknown> }) => {
        changeLogs.push(args.data);
        return args.data;
      }),
    },
    $transaction: jest.fn(async (fn: (tx: HarnessPrisma) => Promise<unknown>) => fn(prisma)),
  };

  const authorizationLoader = {
    loadBySubjectId: jest.fn(async () => authorizationContext),
  };
  const accessPolicies = { bind: jest.fn(async () => ({})) };
  const settings = {
    getSetting: jest.fn(async () => {
      throw new Error('not configured');
    }),
  };
  const configurationLoader = {
    load: jest.fn(async () => ({
      templatesEnabled: options.templatesEnabled ?? true,
      playbooksEnabled: true,
      autoAttach: true,
      requiredStepsOnResolve: 'warn' as const,
    })),
  };

  const service = new ResponseTemplatesService(
    prisma as never,
    authorizationLoader as never,
    accessPolicies as never,
    settings as never,
    configurationLoader as never,
  );

  loadTicketMock.mockImplementation(async () => ({ ticket, access: { visibility: 'staff' } }));

  return { service, prisma, changeLogs, authorizationLoader };
}

const codeOf = async (work: Promise<unknown>): Promise<string> => {
  try {
    await work;
  } catch (error) {
    if (error instanceof TemplatesError) return error.code;
    throw error;
  }
  throw new Error('expected TemplatesError, but the call resolved');
};

describe('ResponseTemplatesService', () => {
  beforeEach(() => {
    // `resetAllMocks` also drops queued `mockResolvedValueOnce` values, so a
    // leftover from an earlier test cannot satisfy a later call; the two
    // module-level defaults are then re-applied.
    jest.resetAllMocks();
    loadTicketMock.mockImplementation(async () => ({ ticket, access: { visibility: 'staff' } }));
    sampleVariablesMock.mockImplementation(() => ({ ticketNumber: 'SAMPLE-1' }) as never);
  });

  describe('permission and feature gates', () => {
    it('refuses every use when the templates feature is off', async () => {
      const { service } = createHarness({ templatesEnabled: false });
      expect(await codeOf(service.listForPicker({}, { actorUserId: 'actor-1' }))).toBe(
        'TEMPLATES_DISABLED',
      );
    });

    it('requires ticket.templates.use in the picker and for rendering', async () => {
      const { service } = createHarness({ context: contextFor([permissionKeys.ticketTemplatesManage]) });
      expect(await codeOf(service.listForPicker({}, { actorUserId: 'actor-1' }))).toBe('FORBIDDEN');
      expect(
        await codeOf(service.render('ticket-1', 'template-1', undefined, { actorUserId: 'actor-1' })),
      ).toBe('FORBIDDEN');
    });

    it('treats an unknown actor as forbidden', async () => {
      const { service } = createHarness({ context: null });
      expect(await codeOf(service.listForPicker({}, { actorUserId: 'ghost' }))).toBe('FORBIDDEN');
    });

    it('lets a super admin through without an explicit permission assignment', async () => {
      const { service, prisma } = createHarness({
        context: { ...contextFor([]), isSuperAdmin: true },
      });
      await expect(service.listForPicker({}, { actorUserId: 'actor-1' })).resolves.toEqual([]);
      expect(prisma.responseTemplate.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('picker', () => {
    const pickerArgs = (prisma: { responseTemplate: { findMany: jest.Mock } }) =>
      prisma.responseTemplate.findMany.mock.calls[0][0] as {
        where: { deletedAt: null; isActive: boolean; AND: unknown[] };
        orderBy: unknown;
        take: number;
      };

    it('queries only active, undeleted, shared-or-own templates and caps the result', async () => {
      const { service, prisma } = createHarness();
      await service.listForPicker(
        { kind: 'REPLY', q: '  štampač ' },
        { actorUserId: 'actor-1' },
      );
      const args = pickerArgs(prisma);
      expect(args.where.deletedAt).toBeNull();
      expect(args.where.isActive).toBe(true);
      expect(args.where.AND).toContainEqual({ OR: [{ ownerUserId: null }, { ownerUserId: 'actor-1' }] });
      expect(args.where.AND).toContainEqual({ kind: { in: ['REPLY', 'ANY'] } });
      expect(args.where.AND).toContainEqual({
        OR: [
          { name: { contains: 'štampač', mode: 'insensitive' } },
          { bodyBs: { contains: 'štampač', mode: 'insensitive' } },
          { bodyEn: { contains: 'štampač', mode: 'insensitive' } },
          { tags: { has: 'štampač' } },
        ],
      });
      expect(args.orderBy).toEqual([{ usageCount: 'desc' }, { name: 'asc' }]);
      expect(args.take).toBe(200);
    });

    it('ranks by scope match before usage and puts shared before personal on a tie', async () => {
      const { service, prisma } = createHarness();
      prisma.responseTemplate.findMany.mockResolvedValueOnce([
        row({ id: 'global', name: 'Globalna', usageCount: 9 }),
        row({
          id: 'service',
          name: 'Servisna',
          usageCount: 1,
          services: [{ serviceId: 'service-1' }],
        }),
        row({
          id: 'personal-service',
          name: 'Moja servisna',
          usageCount: 2,
          ownerUserId: 'actor-1',
          services: [{ serviceId: 'service-1' }],
        }),
      ]);
      const items = await service.listForPicker(
        { ticketId: 'ticket-1' },
        { actorUserId: 'actor-1' },
      );
      expect(items.map((item) => item.id)).toEqual(['service', 'personal-service', 'global']);
      expect(items.map((item) => item.scopeMatch)).toEqual([3, 3, 0]);
      expect(items.find((item) => item.id === 'personal-service')?.ownership).toBe('personal');
      expect(items.find((item) => item.id === 'service')?.ownership).toBe('shared');
    });

    it('drops templates scoped to another service unless the caller asked for all', async () => {
      const { service, prisma } = createHarness();
      const offScope = row({ id: 'elsewhere', services: [{ serviceId: 'service-99' }] });
      prisma.responseTemplate.findMany.mockResolvedValueOnce([offScope]);
      const withoutAll = await service.listForPicker(
        { ticketId: 'ticket-1' },
        { actorUserId: 'actor-1' },
      );
      expect(withoutAll).toEqual([]);

      prisma.responseTemplate.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([offScope]);
      const withAll = await service.listForPicker(
        { ticketId: 'ticket-1', all: true },
        { actorUserId: 'actor-1' },
      );
      expect(withAll.map((item) => item.id)).toEqual(['elsewhere']);
      expect(withAll[0].scopeMatch).toBe(-1);
      // one query for the first call, two for the "show all" call
      expect(prisma.responseTemplate.findMany).toHaveBeenCalledTimes(3);
    });

    it('refuses a caller who cannot see the ticket as staff', async () => {
      const { service } = createHarness();
      loadTicketMock.mockResolvedValueOnce({ ticket, access: { visibility: 'requester' } });
      expect(
        await codeOf(service.listForPicker({ ticketId: 'ticket-1' }, { actorUserId: 'actor-1' })),
      ).toBe('FORBIDDEN');
    });
  });

  describe('render', () => {
    it('validates the template against the composer kind before loading it', async () => {
      const { service, prisma } = createHarness();
      prisma.responseTemplate.findFirst.mockResolvedValueOnce(row());
      buildVariablesMock.mockResolvedValueOnce({});
      await service.render('ticket-1', 'template-1', 'bs', { actorUserId: 'actor-1' }, 'INTERNAL');
      expect(assertUsableMock).toHaveBeenCalledWith(prisma, {
        templateId: 'template-1',
        actorUserId: 'actor-1',
        kind: 'INTERNAL',
      });
    });

    it('fills the bosnian body and reports variables it could not fill', async () => {
      const { service, prisma } = createHarness();
      prisma.responseTemplate.findFirst.mockResolvedValueOnce(
        row({ bodyBs: 'Zdravo {{requesterFirstName}}, tiket {{ticketNumber}} — {{agentName}}' }),
      );
      buildVariablesMock.mockResolvedValueOnce({ requesterFirstName: 'Amina', ticketNumber: 'HD-1' });
      const rendered = await service.render('ticket-1', 'template-1', 'bs', {
        actorUserId: 'actor-1',
      });
      // a known variable without a value is emptied and reported, not kept
      expect(rendered.text).toBe('Zdravo Amina, tiket HD-1 — ');
      expect(rendered.locale).toBe('bs');
      expect(rendered.missing).toEqual(['agentName']);
      expect(rendered.templateId).toBe('template-1');
    });

    it('uses the english body for an english requester and falls back when it is empty', async () => {
      const { service, prisma } = createHarness({ requesterLocale: 'en' });
      prisma.responseTemplate.findFirst.mockResolvedValueOnce(
        row({ bodyBs: 'Bosanski', bodyEn: 'English' }),
      );
      buildVariablesMock.mockResolvedValueOnce({});
      expect(
        (await service.render('ticket-1', 'template-1', undefined, { actorUserId: 'actor-1' })).text,
      ).toBe('English');

      prisma.responseTemplate.findFirst.mockResolvedValueOnce(row({ bodyBs: 'Bosanski' }));
      buildVariablesMock.mockResolvedValueOnce({});
      expect(
        (await service.render('ticket-1', 'template-1', undefined, { actorUserId: 'actor-1' })).text,
      ).toBe('Bosanski');
    });

    it('reports a template that is not visible to the actor as missing', async () => {
      const { service } = createHarness();
      expect(
        await codeOf(service.render('ticket-1', 'template-1', 'bs', { actorUserId: 'actor-1' })),
      ).toBe('TEMPLATE_NOT_FOUND');
    });
  });

  describe('preview', () => {
    it('needs one of the two write permissions', async () => {
      const { service } = createHarness({ context: contextFor([permissionKeys.ticketTemplatesUse]) });
      expect(
        await codeOf(service.preview({ body: 'Zdravo' }, { actorUserId: 'actor-1' })),
      ).toBe('FORBIDDEN');
    });

    it('reports unknown placeholders instead of failing, and trims the body to the limit', async () => {
      const { service } = createHarness({
        context: contextFor([permissionKeys.ticketTemplatesPersonal]),
      });
      const rendered = await service.preview(
        { body: 'Zdravo {{ticketNumber}} {{nepoznato}}', locale: 'bs' },
        { actorUserId: 'actor-1' },
      );
      expect(rendered.text).toBe('Zdravo SAMPLE-1 {{nepoznato}}');
      expect(rendered.unknown).toEqual(['nepoznato']);
      expect(rendered.templateId).toBeNull();
    });
  });

  describe('management', () => {
    it('hides another user’s personal template behind the shared listing path', async () => {
      const { service, prisma } = createHarness();
      prisma.responseTemplate.findFirst.mockResolvedValueOnce(
        row({ ownerUserId: 'someone-else' }),
      );
      expect(await codeOf(service.get('template-1', { actorUserId: 'actor-1' }))).toBe(
        'TEMPLATE_NOT_FOUND',
      );

      prisma.responseTemplate.findFirst.mockResolvedValueOnce(row({ ownerUserId: null }));
      const shared = await service.get('template-1', { actorUserId: 'actor-1' });
      expect(shared.ownership).toBe('shared');
      expect(shared.canEdit).toBe(true);
    });

    it('lists only the caller’s personal templates on the personal path', async () => {
      const { service, prisma } = createHarness({
        context: contextFor([permissionKeys.ticketTemplatesManage, permissionKeys.ticketTemplatesPersonal]),
      });
      await service.listManaged({ ownership: 'mine' }, { actorUserId: 'actor-1' });
      const args = prisma.responseTemplate.findMany.mock.calls[0][0] as { where: { ownerUserId: string } };
      expect(args.where.ownerUserId).toBe('actor-1');
    });

    it('refuses the shared path without ticket.templates.manage', async () => {
      const { service } = createHarness({
        context: contextFor([permissionKeys.ticketTemplatesPersonal]),
      });
      expect(await codeOf(service.listManaged({}, { actorUserId: 'actor-1' }))).toBe('FORBIDDEN');
    });

    it('requires a reason on the shared path and supplies its own on the personal one', async () => {
      const { service, prisma, changeLogs } = createHarness({
        context: contextFor([
          permissionKeys.ticketTemplatesManage,
          permissionKeys.ticketTemplatesPersonal,
        ]),
      });
      prisma.responseTemplate.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValue(null);
      prisma.responseTemplate.create.mockResolvedValue(row());
      expect(
        await codeOf(
          service.create(
            'shared',
            { name: 'Novi', bodyBs: 'Tijelo', kind: 'REPLY' },
            { actorUserId: 'actor-1' },
          ),
        ),
      ).toBe('REASON_REQUIRED');

      await service.create(
        'personal',
        { name: 'Novi', bodyBs: 'Tijelo', kind: 'REPLY' },
        { actorUserId: 'actor-1' },
      );
      expect(changeLogs.at(-1)?.reason).toBe('personal_template');
      const createArgs = prisma.responseTemplate.create.mock.calls.at(-1)?.[0] as {
        data: { ownerUserId: string | null };
      };
      expect(createArgs.data.ownerUserId).toBe('actor-1');
    });

    it('rejects a name that another shared template already uses', async () => {
      const { service, prisma } = createHarness();
      prisma.responseTemplate.findFirst.mockResolvedValueOnce({ id: 'other' });
      expect(
        await codeOf(
          service.create(
            'shared',
            { name: 'Zdravo', bodyBs: 'Tijelo', kind: 'REPLY', reason: 'uveden šablon' },
            { actorUserId: 'actor-1' },
          ),
        ),
      ).toBe('TEMPLATE_NAME_TAKEN');
    });

    it('rejects a scope that points at services, categories or groups that do not exist', async () => {
      const { service, prisma } = createHarness();
      prisma.service.count.mockResolvedValue(0);
      expect(
        await codeOf(
          service.create(
            'shared',
            {
              name: 'Zdravo',
              bodyBs: 'Tijelo',
              kind: 'REPLY',
              serviceIds: ['missing-service'],
              reason: 'uveden šablon',
            },
            { actorUserId: 'actor-1' },
          ),
        ),
      ).toBe('TEMPLATE_SCOPE_INVALID');
    });

    it('stops a service-restricted admin from writing a global shared template', async () => {
      const { service } = createHarness({
        context: contextFor([permissionKeys.ticketTemplatesManage], { serviceId: 'service-1' }),
      });
      expect(
        await codeOf(
          service.create(
            'shared',
            { name: 'Zdravo', bodyBs: 'Tijelo', kind: 'REPLY', reason: 'uveden šablon' },
            { actorUserId: 'actor-1' },
          ),
        ),
      ).toBe('TEMPLATE_SCOPE_FORBIDDEN');
    });

    it('writes the scope rows and an audit entry when a shared template is created', async () => {
      const { service, prisma, changeLogs } = createHarness();
      prisma.responseTemplate.findFirst.mockResolvedValue(null);
      prisma.responseTemplate.create.mockResolvedValue(
        row({ services: [{ serviceId: 'service-1' }], categories: [{ categoryId: 'category-1' }] }),
      );
      const created = await service.create(
        'shared',
        {
          name: '  Zdravo   svima ',
          bodyBs: 'Tijelo',
          kind: 'REPLY',
          serviceIds: ['service-1'],
          categoryIds: ['category-1'],
          reason: '  uveden šablon ',
        },
        { actorUserId: 'actor-1' },
      );
      const createArgs = prisma.responseTemplate.create.mock.calls[0][0] as {
        data: {
          name: string;
          ownerUserId: string | null;
          services: { create: { serviceId: string }[] };
          categories: { create: { categoryId: string }[] };
        };
      };
      expect(createArgs.data.name).toBe('Zdravo svima');
      expect(createArgs.data.ownerUserId).toBeNull();
      expect(createArgs.data.services.create).toEqual([{ serviceId: 'service-1' }]);
      expect(createArgs.data.categories.create).toEqual([{ categoryId: 'category-1' }]);
      expect(created.serviceIds).toEqual(['service-1']);
      expect(created.canEdit).toBe(true);
      expect(changeLogs).toHaveLength(1);
      expect(changeLogs[0]).toMatchObject({
        entityType: 'response_template',
        reason: 'uveden šablon',
        actorUserId: 'actor-1',
      });
      expect((changeLogs[0].diff as { action: string }).action).toBe('create');
    });

    it('replaces the whole scope on update and logs the before/after snapshot', async () => {
      const { service, prisma, changeLogs } = createHarness();
      prisma.responseTemplate.findFirst.mockResolvedValue(null);
      prisma.responseTemplate.findFirst
        .mockResolvedValueOnce(row({ services: [{ serviceId: 'service-1' }] }))
        .mockResolvedValueOnce(null);
      prisma.responseTemplate.update.mockResolvedValue(
        row({ services: [{ serviceId: 'service-2' }] }),
      );
      const updated = await service.update(
        'shared',
        'template-1',
        {
          name: 'Zdravo',
          bodyBs: 'Novo tijelo',
          kind: 'REPLY',
          serviceIds: ['service-2'],
          reason: 'preciziran opseg',
        },
        { actorUserId: 'actor-1' },
      );
      expect(prisma.responseTemplateService.deleteMany).toHaveBeenCalledWith({
        where: { templateId: 'template-1' },
      });
      expect(prisma.responseTemplateCategory.deleteMany).toHaveBeenCalled();
      expect(prisma.responseTemplateGroup.deleteMany).toHaveBeenCalled();
      expect(updated.serviceIds).toEqual(['service-2']);
      const diff = changeLogs[0].diff as {
        action: string;
        before: { serviceIds: string[] };
        after: { serviceIds: string[] };
      };
      expect(diff.action).toBe('update');
      expect(diff.before.serviceIds).toEqual(['service-1']);
      expect(diff.after.serviceIds).toEqual(['service-2']);
    });

    it('refuses to move a template out of the scope the actor may manage', async () => {
      const { service, prisma } = createHarness({
        context: contextFor([permissionKeys.ticketTemplatesManage], { serviceId: 'service-1' }),
      });
      prisma.responseTemplate.findFirst
        .mockResolvedValueOnce(row({ services: [{ serviceId: 'service-1' }] }))
        .mockResolvedValueOnce(null);
      expect(
        await codeOf(
          service.update(
            'shared',
            'template-1',
            {
              name: 'Zdravo',
              bodyBs: 'Novo',
              kind: 'REPLY',
              serviceIds: ['service-2'],
              reason: 'preciziran opseg',
            },
            { actorUserId: 'actor-1' },
          ),
        ),
      ).toBe('TEMPLATE_SCOPE_FORBIDDEN');
      expect(prisma.responseTemplate.update).not.toHaveBeenCalled();
    });

    it('soft-deletes instead of removing, so sent messages keep their link', async () => {
      const { service, prisma, changeLogs } = createHarness();
      prisma.responseTemplate.findFirst.mockResolvedValueOnce(row());
      const result = await service.remove('shared', 'template-1', 'šablon više ne treba', {
        actorUserId: 'actor-1',
      });
      expect(result).toEqual({ id: 'template-1' });
      const updateArgs = prisma.responseTemplate.update.mock.calls[0][0] as {
        where: { id: string };
        data: { deletedAt: Date; isActive: boolean };
      };
      expect(updateArgs.where).toEqual({ id: 'template-1' });
      expect(updateArgs.data.deletedAt).toBeInstanceOf(Date);
      expect(updateArgs.data.isActive).toBe(false);
      expect((changeLogs[0].diff as { action: string }).action).toBe('delete');
      expect(changeLogs[0].reason).toBe('šablon više ne treba');
    });

    it('exposes ownership, variables and edit rights in the response', async () => {
      const { service, prisma } = createHarness();
      prisma.responseTemplate.findFirst.mockResolvedValueOnce(
        row({
          ownerUserId: 'actor-1',
          bodyBs: 'Zdravo {{ticketNumber}}',
          bodyEn: 'Hello {{agentName}}',
          usageCount: 4,
          lastUsedAt: new Date('2026-02-03T00:00:00.000Z'),
        }),
      );
      const found = await service.get('template-1', { actorUserId: 'actor-1' });
      expect(found.ownership).toBe('personal');
      expect(found.canEdit).toBe(true);
      expect(found.variables).toEqual(['ticketNumber', 'agentName']);
      expect(found.usageCount).toBe(4);
      expect(found.lastUsedAt).toBe('2026-02-03T00:00:00.000Z');
      expect(found.updatedAt).toBe('2026-01-02T03:04:05.000Z');
    });
  });
});
