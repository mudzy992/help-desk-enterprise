import { HttpException } from '@nestjs/common';
import { permissionKeys } from '../authorization/authorization.constants';
import type { AuthorizationAssignment, AuthorizationContext } from '../authorization/authorization.types';
import { mapTemplatesError } from './map-templates-error';
import { TemplatesError } from './templates.error';
import { ResponseTemplatesService } from './response-templates.service';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));
jest.mock('../tickets/ticket-access-policy-binder', () => ({
  TicketAccessPolicyBinder: class TicketAccessPolicyBinder {},
}));
jest.mock('../tickets/load-accessible-ticket', () => ({
  loadAccessibleTicket: jest.fn(),
}));
jest.mock('./assert-response-template-usable', () => ({
  assertResponseTemplateUsable: jest.fn(),
}));
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
  options: {
    readonly isSuperAdmin?: boolean;
    readonly serviceId?: string | null;
  } = {},
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
    readonly findUnique: jest.Mock;
    readonly count: jest.Mock;
    readonly create: jest.Mock;
    readonly update: jest.Mock;
    readonly updateMany: jest.Mock;
  };
  readonly responseTemplateService: {
    readonly deleteMany: jest.Mock;
    readonly createMany: jest.Mock;
  };
  readonly responseTemplateCategory: {
    readonly deleteMany: jest.Mock;
    readonly createMany: jest.Mock;
  };
  readonly responseTemplateGroup: {
    readonly deleteMany: jest.Mock;
    readonly createMany: jest.Mock;
  };
  readonly service: {
    readonly count: jest.Mock;
    readonly findUnique: jest.Mock;
  };
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
      findUnique: jest.fn(async (_args: unknown): Promise<Row | null> => row()),
      count: jest.fn(async () => 0),
      create: jest.fn(async (_args: unknown): Promise<Row> => row()),
      update: jest.fn(async (_args: unknown): Promise<Row> => row()),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    responseTemplateService: {
      deleteMany: jest.fn(async () => ({ count: 0 })),
      createMany: jest.fn(async () => ({ count: 0 })),
    },
    responseTemplateCategory: {
      deleteMany: jest.fn(async () => ({ count: 0 })),
      createMany: jest.fn(async () => ({ count: 0 })),
    },
    responseTemplateGroup: {
      deleteMany: jest.fn(async () => ({ count: 0 })),
      createMany: jest.fn(async () => ({ count: 0 })),
    },
    service: {
      count: jest.fn(async () => 1),
      findUnique: jest.fn(async () => ({ categoryId: 'category-1' })),
    },
    serviceCategory: { count: jest.fn(async () => 1) },
    group: { count: jest.fn(async () => 1) },
    user: {
      findUnique: jest.fn(async () => ({
        preferredLocale: options.requesterLocale ?? 'bs',
      })),
    },
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

  loadTicketMock.mockImplementation(async () => ({
    ticket,
    access: { visibility: 'staff' },
  }));

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
    loadTicketMock.mockImplementation(async () => ({
      ticket,
      access: { visibility: 'staff' },
    }));
    sampleVariablesMock.mockImplementation(() => ({ ticketNumber: 'SAMPLE-1' }) as never);
  });

  describe('permission and feature gates', () => {
    it('refuses every use when the templates feature is off', async () => {
      const { service } = createHarness({ templatesEnabled: false });
      expect(await codeOf(service.listForPicker({}, { actorUserId: 'actor-1' }))).toBe('TEMPLATES_DISABLED');
    });

    it('requires ticket.templates.use in the picker and for rendering', async () => {
      const { service } = createHarness({
        context: contextFor([permissionKeys.ticketTemplatesManage]),
      });
      expect(await codeOf(service.listForPicker({}, { actorUserId: 'actor-1' }))).toBe('FORBIDDEN');
      expect(
        await codeOf(
          service.render('ticket-1', 'template-1', undefined, {
            actorUserId: 'actor-1',
          }),
        ),
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
      await expect(service.listForPicker({}, { actorUserId: 'actor-1' })).resolves.toMatchObject({
        items: [],
        hasMore: false,
        nextCursor: null,
      });
      expect(prisma.responseTemplate.findMany).toHaveBeenCalledTimes(2);
    });
  });

  describe('picker', () => {
    const pickerArgs = (prisma: { responseTemplate: { findMany: jest.Mock } }) =>
      prisma.responseTemplate.findMany.mock.calls[0][0] as {
        where: { deletedAt: null; isActive: boolean; AND: unknown[] };
        orderBy: unknown;
        take: number;
      };

    it('queries only active, undeleted templates with a stable bounded page', async () => {
      const { service, prisma } = createHarness();
      await service.listForPicker({ kind: 'REPLY', q: '  štampač ' }, { actorUserId: 'actor-1' });
      const args = pickerArgs(prisma);
      expect(args.where.deletedAt).toBeNull();
      expect(args.where.isActive).toBe(true);
      expect(args.where.AND).toContainEqual({ ownerUserId: null });
      expect(args.where.AND).toContainEqual({
        services: { none: {} },
        categories: { none: {} },
        groups: { none: {} },
      });
      expect(args.where.AND).toContainEqual({ kind: { in: ['REPLY', 'ANY'] } });
      expect(args.where.AND).toContainEqual({
        OR: [
          { name: { contains: 'štampač', mode: 'insensitive' } },
          { bodyBs: { contains: 'štampač', mode: 'insensitive' } },
          { bodyEn: { contains: 'štampač', mode: 'insensitive' } },
          { tags: { has: 'štampač' } },
        ],
      });
      expect(args.orderBy).toEqual([{ usageCount: 'desc' }, { name: 'asc' }, { id: 'asc' }]);
      expect(args.take).toBe(51);
    });

    it('ranks by scope match before usage and puts shared before personal on a tie', async () => {
      const { service, prisma } = createHarness();
      prisma.responseTemplate.findMany
        .mockResolvedValueOnce([
          row({
            id: 'service',
            name: 'Servisna',
            usageCount: 1,
            services: [{ serviceId: 'service-1' }],
          }),
        ])
        .mockResolvedValueOnce([
          row({
            id: 'personal-service',
            name: 'Moja servisna',
            usageCount: 2,
            ownerUserId: 'actor-1',
            services: [{ serviceId: 'service-1' }],
          }),
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([row({ id: 'global', name: 'Globalna', usageCount: 9 })])
        .mockResolvedValueOnce([])
        .mockResolvedValue([]);
      const page = await service.listForPicker({ ticketId: 'ticket-1' }, { actorUserId: 'actor-1' });
      expect(page.items.map((item) => item.id)).toEqual(['service', 'personal-service', 'global']);
      expect(page.items.map((item) => item.scopeMatch)).toEqual([3, 3, 0]);
      expect(page.items.find((item) => item.id === 'personal-service')?.ownership).toBe('personal');
      expect(page.items.find((item) => item.id === 'service')?.ownership).toBe('shared');
    });

    it('uses a usage/name/ID cursor inside the matching-scope tier', async () => {
      const { service, prisma } = createHarness();
      prisma.responseTemplate.findMany.mockResolvedValueOnce([
        row({
          id: 'template-a',
          name: 'Same name',
          usageCount: 5,
          services: [{ serviceId: 'service-1' }],
        }),
        row({
          id: 'template-b',
          name: 'Same name',
          usageCount: 5,
          services: [{ serviceId: 'service-1' }],
        }),
      ]);
      const first = await service.listForPicker({ ticketId: 'ticket-1', take: 1 }, { actorUserId: 'actor-1' });
      expect(first.items.map((item) => item.id)).toEqual(['template-a']);
      expect(first.hasMore).toBe(true);
      expect(first.nextCursor).not.toBeNull();

      prisma.responseTemplate.findMany.mockResolvedValueOnce([
        row({
          id: 'template-b',
          name: 'Same name',
          usageCount: 5,
          services: [{ serviceId: 'service-1' }],
        }),
      ]);
      const second = await service.listForPicker(
        {
          ticketId: 'ticket-1',
          take: 1,
          cursor: first.nextCursor ?? undefined,
        },
        { actorUserId: 'actor-1' },
      );
      expect(second.items.map((item) => item.id)).toEqual(['template-b']);
      expect(second.items[0]?.scopeMatch).toBe(3);
      expect(second.hasMore).toBe(false);
      expect(prisma.responseTemplate.findMany.mock.calls[1]?.[0]).toMatchObject({
        where: {
          AND: [
            { ownerUserId: null },
            { services: { some: { serviceId: 'service-1' } } },
            {
              OR: [
                { usageCount: { lt: 5 } },
                { usageCount: 5, name: { gt: 'Same name' } },
                {
                  usageCount: 5,
                  name: 'Same name',
                  id: { gt: 'template-a' },
                },
              ],
            },
          ],
        },
      });
    });

    it('drops templates scoped to another service unless the caller asked for all', async () => {
      const { service, prisma } = createHarness();
      const offScope = row({
        id: 'elsewhere',
        services: [{ serviceId: 'service-99' }],
      });
      const withoutAll = await service.listForPicker({ ticketId: 'ticket-1' }, { actorUserId: 'actor-1' });
      expect(withoutAll.items).toEqual([]);

      prisma.responseTemplate.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([offScope])
        .mockResolvedValueOnce([]);
      const withAll = await service.listForPicker({ ticketId: 'ticket-1', all: true }, { actorUserId: 'actor-1' });
      expect(withAll.items.map((item) => item.id)).toEqual(['elsewhere']);
      expect(withAll.items[0]?.scopeMatch).toBe(-1);
      // Four eligible scope tiers have shared/personal queries, then show-all adds two.
      expect(prisma.responseTemplate.findMany).toHaveBeenCalledTimes(18);
    });

    it('refuses a caller who cannot see the ticket as staff', async () => {
      const { service } = createHarness();
      loadTicketMock.mockResolvedValueOnce({
        ticket,
        access: { visibility: 'requester' },
      });
      expect(await codeOf(service.listForPicker({ ticketId: 'ticket-1' }, { actorUserId: 'actor-1' }))).toBe(
        'FORBIDDEN',
      );
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
        row({
          bodyBs: 'Zdravo {{requesterFirstName}}, tiket {{ticketNumber}} — {{agentName}}',
        }),
      );
      buildVariablesMock.mockResolvedValueOnce({
        requesterFirstName: 'Amina',
        ticketNumber: 'HD-1',
      });
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
      prisma.responseTemplate.findFirst.mockResolvedValueOnce(row({ bodyBs: 'Bosanski', bodyEn: 'English' }));
      buildVariablesMock.mockResolvedValueOnce({});
      expect(
        (
          await service.render('ticket-1', 'template-1', undefined, {
            actorUserId: 'actor-1',
          })
        ).text,
      ).toBe('English');

      prisma.responseTemplate.findFirst.mockResolvedValueOnce(row({ bodyBs: 'Bosanski' }));
      buildVariablesMock.mockResolvedValueOnce({});
      expect(
        (
          await service.render('ticket-1', 'template-1', undefined, {
            actorUserId: 'actor-1',
          })
        ).text,
      ).toBe('Bosanski');
    });

    it('reports a template that is not visible to the actor as missing', async () => {
      const { service } = createHarness();
      expect(
        await codeOf(
          service.render('ticket-1', 'template-1', 'bs', {
            actorUserId: 'actor-1',
          }),
        ),
      ).toBe('TEMPLATE_NOT_FOUND');
    });
  });

  describe('preview', () => {
    it('needs one of the two write permissions', async () => {
      const { service } = createHarness({
        context: contextFor([permissionKeys.ticketTemplatesUse]),
      });
      expect(await codeOf(service.preview({ body: 'Zdravo' }, { actorUserId: 'actor-1' }))).toBe('FORBIDDEN');
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
    it('filters shared management rows before count and returns a stable cursor page', async () => {
      const { service, prisma } = createHarness({
        context: contextFor([permissionKeys.ticketTemplatesManage], {
          serviceId: 'service-1',
        }),
      });
      prisma.responseTemplate.findMany.mockResolvedValueOnce([
        row({ id: 'allowed', services: [{ serviceId: 'service-1' }] }),
      ]);
      prisma.responseTemplate.count.mockResolvedValueOnce(1);

      const page = await service.listManaged({}, { actorUserId: 'actor-1' });
      expect(page.items.map((item) => item.id)).toEqual(['allowed']);
      expect(page.total).toBe(1);
      expect(page.hasMore).toBe(false);

      const args = prisma.responseTemplate.findMany.mock.calls[0]?.[0] as {
        where: { AND: readonly unknown[] };
        orderBy: unknown;
        take: number;
      };
      expect(args.where.AND).toContainEqual({
        services: {
          some: { serviceId: { in: ['service-1'] } },
          every: { serviceId: { in: ['service-1'] } },
        },
        categories: { none: {} },
        groups: { none: {} },
      });
      expect(args.orderBy).toEqual([{ name: 'asc' }, { id: 'asc' }]);
      expect(args.take).toBe(51);
      expect(prisma.responseTemplate.count).toHaveBeenCalledWith({
        where: args.where,
      });
    });

    it('uses the ID tie-breaker across equal-name management page boundaries', async () => {
      const { service, prisma } = createHarness();
      prisma.responseTemplate.count.mockResolvedValue(3);
      prisma.responseTemplate.findMany.mockResolvedValueOnce([
        row({ id: 'template-a', name: 'A' }),
        row({ id: 'template-b', name: 'B' }),
        row({ id: 'template-c', name: 'B' }),
      ]);
      const first = await service.listManaged({ take: 2 }, { actorUserId: 'actor-1' });
      expect(first.items.map((item) => item.id)).toEqual(['template-a', 'template-b']);
      expect(first.total).toBe(3);
      expect(first.hasMore).toBe(true);
      expect(first.nextCursor).not.toBeNull();

      prisma.responseTemplate.findMany.mockResolvedValueOnce([row({ id: 'template-c', name: 'B' })]);
      const second = await service.listManaged(
        { take: 2, cursor: first.nextCursor ?? undefined },
        { actorUserId: 'actor-1' },
      );
      expect(second.items.map((item) => item.id)).toEqual(['template-c']);
      expect(second.total).toBe(3);
      expect(second.hasMore).toBe(false);
      expect(second.nextCursor).toBeNull();
      expect(prisma.responseTemplate.findMany.mock.calls[0]?.[0]).toMatchObject({
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: 3,
      });
      expect(prisma.responseTemplate.findMany.mock.calls[1]?.[0]).toMatchObject({
        where: {
          AND: [
            { deletedAt: null, ownerUserId: null },
            {
              OR: [{ name: { gt: 'B' } }, { name: 'B', id: { gt: 'template-b' } }],
            },
          ],
        },
      });
      expect(prisma.responseTemplate.count).toHaveBeenCalledTimes(2);
    });

    it('hides a foreign shared template on get and constrains the database lookup', async () => {
      const { service, prisma } = createHarness({
        context: contextFor([permissionKeys.ticketTemplatesManage], {
          serviceId: 'service-1',
        }),
      });
      prisma.responseTemplate.findFirst.mockResolvedValueOnce(
        row({ ownerUserId: null, services: [{ serviceId: 'service-2' }] }),
      );

      expect(await codeOf(service.get('foreign', { actorUserId: 'actor-1' }))).toBe('TEMPLATE_NOT_FOUND');
      const args = prisma.responseTemplate.findFirst.mock.calls[0]?.[0] as {
        where: { OR: readonly Record<string, unknown>[] };
      };
      const sharedBranch = args.where.OR.find((branch) => branch.ownerUserId === null);
      expect(sharedBranch).toMatchObject({
        ownerUserId: null,
        services: {
          some: { serviceId: { in: ['service-1'] } },
          every: { serviceId: { in: ['service-1'] } },
        },
        categories: { none: {} },
        groups: { none: {} },
      });
    });

    it('hides another user’s personal template behind the shared listing path', async () => {
      const { service, prisma } = createHarness();
      prisma.responseTemplate.findFirst.mockResolvedValueOnce(row({ ownerUserId: 'someone-else' }));
      expect(await codeOf(service.get('template-1', { actorUserId: 'actor-1' }))).toBe('TEMPLATE_NOT_FOUND');

      prisma.responseTemplate.findFirst.mockResolvedValueOnce(row({ ownerUserId: null }));
      const shared = await service.get('template-1', {
        actorUserId: 'actor-1',
      });
      expect(shared.ownership).toBe('shared');
      expect(shared.canEdit).toBe(true);
    });

    it('lists only the caller’s personal templates on the personal path', async () => {
      const { service, prisma } = createHarness({
        context: contextFor([permissionKeys.ticketTemplatesManage, permissionKeys.ticketTemplatesPersonal]),
      });
      await service.listManaged({ ownership: 'mine' }, { actorUserId: 'actor-1' });
      const args = prisma.responseTemplate.findMany.mock.calls[0][0] as {
        where: { ownerUserId: string };
      };
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
        context: contextFor([permissionKeys.ticketTemplatesManage, permissionKeys.ticketTemplatesPersonal]),
      });
      prisma.responseTemplate.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValue(null);
      prisma.responseTemplate.create.mockResolvedValue(row());
      expect(
        await codeOf(
          service.create('shared', { name: 'Novi', bodyBs: 'Tijelo', kind: 'REPLY' }, { actorUserId: 'actor-1' }),
        ),
      ).toBe('REASON_REQUIRED');

      await service.create('personal', { name: 'Novi', bodyBs: 'Tijelo', kind: 'REPLY' }, { actorUserId: 'actor-1' });
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
            {
              name: 'Zdravo',
              bodyBs: 'Tijelo',
              kind: 'REPLY',
              reason: 'uveden šablon',
            },
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
        context: contextFor([permissionKeys.ticketTemplatesManage], {
          serviceId: 'service-1',
        }),
      });
      expect(
        await codeOf(
          service.create(
            'shared',
            {
              name: 'Zdravo',
              bodyBs: 'Tijelo',
              kind: 'REPLY',
              reason: 'uveden šablon',
            },
            { actorUserId: 'actor-1' },
          ),
        ),
      ).toBe('TEMPLATE_SCOPE_FORBIDDEN');
    });

    it('writes the scope rows and an audit entry when a shared template is created', async () => {
      const { service, prisma, changeLogs } = createHarness();
      prisma.responseTemplate.findFirst.mockResolvedValue(null);
      prisma.responseTemplate.create.mockResolvedValue(
        row({
          services: [{ serviceId: 'service-1' }],
          categories: [{ categoryId: 'category-1' }],
        }),
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
      prisma.responseTemplate.findUnique.mockResolvedValue(row({ services: [{ serviceId: 'service-2' }] }));
      const updated = await service.update(
        'shared',
        'template-1',
        {
          name: 'Zdravo',
          bodyBs: 'Novo tijelo',
          kind: 'REPLY',
          serviceIds: ['service-2'],
          reason: 'preciziran opseg',
          expectedUpdatedAt: row().updatedAt.toISOString(),
        },
        { actorUserId: 'actor-1' },
      );
      expect(prisma.responseTemplateService.deleteMany).toHaveBeenCalledWith({
        where: { templateId: 'template-1' },
      });
      expect(prisma.responseTemplateCategory.deleteMany).toHaveBeenCalled();
      expect(prisma.responseTemplateGroup.deleteMany).toHaveBeenCalled();
      expect(prisma.responseTemplateService.createMany).toHaveBeenCalledWith({
        data: [{ templateId: 'template-1', serviceId: 'service-2' }],
      });
      const claim = prisma.responseTemplate.updateMany.mock.calls[0]?.[0] as {
        where: { id: string; updatedAt: Date };
        data: { updatedAt: Date };
      };
      expect(claim.where).toMatchObject({
        id: 'template-1',
        updatedAt: row().updatedAt,
      });
      expect(claim.data.updatedAt.getTime()).toBeGreaterThan(row().updatedAt.getTime());
      expect(prisma.responseTemplate.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.responseTemplateService.deleteMany.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
      );
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
        context: contextFor([permissionKeys.ticketTemplatesManage], {
          serviceId: 'service-1',
        }),
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
              expectedUpdatedAt: row().updatedAt.toISOString(),
            },
            { actorUserId: 'actor-1' },
          ),
        ),
      ).toBe('TEMPLATE_SCOPE_FORBIDDEN');
      expect(prisma.responseTemplate.updateMany).not.toHaveBeenCalled();
    });

    it('soft-deletes instead of removing, so sent messages keep their link', async () => {
      const { service, prisma, changeLogs } = createHarness();
      prisma.responseTemplate.findFirst.mockResolvedValueOnce(row());
      const result = await service.remove(
        'shared',
        'template-1',
        {
          reason: 'šablon više ne treba',
          expectedUpdatedAt: row().updatedAt.toISOString(),
        },
        { actorUserId: 'actor-1' },
      );
      expect(result).toEqual({ id: 'template-1' });
      const updateArgs = prisma.responseTemplate.updateMany.mock.calls[0][0] as {
        where: { id: string; updatedAt: Date };
        data: { deletedAt: Date; isActive: boolean; updatedAt: Date };
      };
      expect(updateArgs.where).toMatchObject({
        id: 'template-1',
        updatedAt: row().updatedAt,
      });
      expect(updateArgs.data.deletedAt).toBeInstanceOf(Date);
      expect(updateArgs.data.isActive).toBe(false);
      expect(updateArgs.data.updatedAt.getTime()).toBeGreaterThan(row().updatedAt.getTime());
      expect((changeLogs[0].diff as { action: string }).action).toBe('delete');
      expect(changeLogs[0].reason).toBe('šablon više ne treba');
    });

    it.each(['shared', 'personal'] as const)('requires a revision before updating a %s template', async (ownership) => {
      const { service, prisma } = createHarness({
        context: contextFor([permissionKeys.ticketTemplatesManage, permissionKeys.ticketTemplatesPersonal]),
      });
      const code = await codeOf(
        service.update(
          ownership,
          'template-1',
          {
            name: 'Zdravo',
            bodyBs: 'Novo',
            kind: 'REPLY',
            reason: 'uređeno',
          },
          { actorUserId: 'actor-1' },
        ),
      );
      expect(code).toBe('TEMPLATE_PRECONDITION_REQUIRED');
      expect(prisma.responseTemplate.findFirst).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      const missing = mapTemplatesError(new TemplatesError('TEMPLATE_PRECONDITION_REQUIRED'));
      expect((missing as HttpException).getStatus()).toBe(400);
    });

    it.each(['shared', 'personal'] as const)(
      'rejects a stale %s update before scope or audit changes',
      async (ownership) => {
        const { service, prisma, changeLogs } = createHarness({
          context: contextFor([permissionKeys.ticketTemplatesManage, permissionKeys.ticketTemplatesPersonal]),
        });
        prisma.responseTemplate.findFirst.mockResolvedValueOnce(
          row({
            ownerUserId: ownership === 'personal' ? 'actor-1' : null,
            updatedAt: new Date('2026-01-03T03:04:05.000Z'),
          }),
        );
        const code = await codeOf(
          service.update(
            ownership,
            'template-1',
            {
              name: 'Zdravo',
              bodyBs: 'Novo',
              kind: 'REPLY',
              reason: 'uređeno',
              expectedUpdatedAt: row().updatedAt.toISOString(),
            },
            { actorUserId: 'actor-1' },
          ),
        );
        expect(code).toBe('TEMPLATE_VERSION_CONFLICT');
        expect((mapTemplatesError(new TemplatesError('TEMPLATE_VERSION_CONFLICT')) as HttpException).getStatus()).toBe(
          409,
        );
        expect(prisma.$transaction).not.toHaveBeenCalled();
        expect(prisma.responseTemplateService.deleteMany).not.toHaveBeenCalled();
        expect(prisma.responseTemplateCategory.deleteMany).not.toHaveBeenCalled();
        expect(prisma.responseTemplateGroup.deleteMany).not.toHaveBeenCalled();
        expect(changeLogs).toHaveLength(0);
      },
    );

    it.each(['shared', 'personal'] as const)(
      'does not modify scope or audit when the %s update loses the CAS',
      async (ownership) => {
        const { service, prisma, changeLogs } = createHarness({
          context: contextFor([permissionKeys.ticketTemplatesManage, permissionKeys.ticketTemplatesPersonal]),
        });
        prisma.responseTemplate.findFirst
          .mockResolvedValueOnce(row({ ownerUserId: ownership === 'personal' ? 'actor-1' : null }))
          .mockResolvedValueOnce(null);
        prisma.responseTemplate.updateMany.mockResolvedValueOnce({ count: 0 });
        const code = await codeOf(
          service.update(
            ownership,
            'template-1',
            {
              name: 'Zdravo',
              bodyBs: 'Novo',
              kind: 'REPLY',
              serviceIds: ['service-2'],
              reason: 'uređeno',
              expectedUpdatedAt: row().updatedAt.toISOString(),
            },
            { actorUserId: 'actor-1' },
          ),
        );
        expect(code).toBe('TEMPLATE_VERSION_CONFLICT');
        expect(prisma.responseTemplateService.deleteMany).not.toHaveBeenCalled();
        expect(prisma.responseTemplateService.createMany).not.toHaveBeenCalled();
        expect(prisma.responseTemplateCategory.deleteMany).not.toHaveBeenCalled();
        expect(prisma.responseTemplateGroup.deleteMany).not.toHaveBeenCalled();
        expect(changeLogs).toHaveLength(0);
      },
    );

    it.each(['shared', 'personal'] as const)('requires a revision before deleting a %s template', async (ownership) => {
      const { service, prisma } = createHarness({
        context: contextFor([permissionKeys.ticketTemplatesManage, permissionKeys.ticketTemplatesPersonal]),
      });
      const code = await codeOf(
        service.remove(ownership, 'template-1', { reason: 'ukinut' }, { actorUserId: 'actor-1' }),
      );
      expect(code).toBe('TEMPLATE_PRECONDITION_REQUIRED');
      expect(prisma.responseTemplate.findFirst).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it.each(['shared', 'personal'] as const)(
      'rejects a stale %s delete before tombstone or audit changes',
      async (ownership) => {
        const { service, prisma, changeLogs } = createHarness({
          context: contextFor([permissionKeys.ticketTemplatesManage, permissionKeys.ticketTemplatesPersonal]),
        });
        prisma.responseTemplate.findFirst.mockResolvedValueOnce(
          row({
            ownerUserId: ownership === 'personal' ? 'actor-1' : null,
            updatedAt: new Date('2026-01-03T03:04:05.000Z'),
          }),
        );
        const code = await codeOf(
          service.remove(
            ownership,
            'template-1',
            {
              reason: 'ukinut',
              expectedUpdatedAt: row().updatedAt.toISOString(),
            },
            { actorUserId: 'actor-1' },
          ),
        );
        expect(code).toBe('TEMPLATE_VERSION_CONFLICT');
        expect(prisma.$transaction).not.toHaveBeenCalled();
        expect(prisma.responseTemplate.updateMany).not.toHaveBeenCalled();
        expect(changeLogs).toHaveLength(0);
      },
    );

    it.each(['shared', 'personal'] as const)(
      'does not soft-delete or audit when the %s delete loses the CAS',
      async (ownership) => {
        const { service, prisma, changeLogs } = createHarness({
          context: contextFor([permissionKeys.ticketTemplatesManage, permissionKeys.ticketTemplatesPersonal]),
        });
        prisma.responseTemplate.findFirst.mockResolvedValueOnce(
          row({ ownerUserId: ownership === 'personal' ? 'actor-1' : null }),
        );
        prisma.responseTemplate.updateMany.mockResolvedValueOnce({ count: 0 });
        const code = await codeOf(
          service.remove(
            ownership,
            'template-1',
            {
              reason: 'ukinut',
              expectedUpdatedAt: row().updatedAt.toISOString(),
            },
            { actorUserId: 'actor-1' },
          ),
        );
        expect(code).toBe('TEMPLATE_VERSION_CONFLICT');
        expect(prisma.responseTemplate.updateMany).toHaveBeenCalledTimes(1);
        expect(changeLogs).toHaveLength(0);
      },
    );

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
