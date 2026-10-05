import { permissionKeys } from '../../authorization/authorization.constants';
import type {
  AuthorizationAssignment,
  AuthorizationContext,
} from '../../authorization/authorization.types';
import { PlaybooksService } from './playbooks.service';
import { TemplatesError } from '../templates.error';

type StepRow = {
  stepKey: string;
  position: number;
  title: string;
  instructions: string | null;
  required: boolean;
  knowledgeArticleId: string | null;
  responseTemplateId: string | null;
};

type Row = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  steps: StepRow[];
  services: { serviceId: string }[];
  categories: { categoryId: string }[];
};

const step = (overrides: Partial<StepRow> = {}): StepRow => ({
  stepKey: 'prvi-korak',
  position: 0,
  title: 'Provjeri kabl',
  instructions: null,
  required: true,
  knowledgeArticleId: null,
  responseTemplateId: null,
  ...overrides,
});

const row = (overrides: Partial<Row> = {}): Row => ({
  id: 'playbook-1',
  name: 'Mrežni kvar',
  description: null,
  isActive: true,
  version: 1,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  steps: [step()],
  services: [{ serviceId: 'service-1' }],
  categories: [],
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

type HarnessPrisma = {
  readonly playbook: {
    readonly findMany: jest.Mock;
    readonly findFirst: jest.Mock;
    readonly create: jest.Mock;
    readonly update: jest.Mock;
  };
  readonly playbookService: { readonly deleteMany: jest.Mock };
  readonly playbookCategory: { readonly deleteMany: jest.Mock };
  readonly playbookStep: { readonly deleteMany: jest.Mock; readonly upsert: jest.Mock };
  readonly ticketPlaybook: { readonly groupBy: jest.Mock };
  readonly service: { readonly count: jest.Mock };
  readonly serviceCategory: { readonly count: jest.Mock };
  readonly knowledgeArticle: { readonly count: jest.Mock };
  readonly responseTemplate: { readonly count: jest.Mock };
  readonly changeLog: { readonly create: jest.Mock };
  readonly $transaction: jest.Mock;
};

function createHarness(
  options: { readonly context?: AuthorizationContext | null; readonly playbooksEnabled?: boolean } = {},
) {
  const changeLogs: Record<string, unknown>[] = [];
  const authorizationContext: AuthorizationContext | null =
    options.context === undefined
      ? contextFor([permissionKeys.ticketTemplatesManage])
      : options.context;

  const prisma: HarnessPrisma = {
    playbook: {
      findMany: jest.fn(async (_args: unknown): Promise<Row[]> => []),
      findFirst: jest.fn(async (_args: unknown): Promise<Row | null> => null),
      create: jest.fn(async (_args: unknown): Promise<Row> => row()),
      update: jest.fn(async (_args: unknown): Promise<Row> => row()),
    },
    playbookService: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    playbookCategory: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    playbookStep: {
      deleteMany: jest.fn(async () => ({ count: 0 })),
      upsert: jest.fn(async () => ({})),
    },
    ticketPlaybook: { groupBy: jest.fn(async () => []) },
    service: { count: jest.fn(async () => 1) },
    serviceCategory: { count: jest.fn(async () => 1) },
    knowledgeArticle: { count: jest.fn(async () => 1) },
    responseTemplate: { count: jest.fn(async () => 1) },
    changeLog: {
      create: jest.fn(async (args: { data: Record<string, unknown> }) => {
        changeLogs.push(args.data);
        return args.data;
      }),
    },
    $transaction: jest.fn(async (fn: (tx: HarnessPrisma) => Promise<unknown>) => fn(prisma)),
  };

  const authorizationLoader = { loadBySubjectId: jest.fn(async () => authorizationContext) };
  const configurationLoader = {
    load: jest.fn(async () => ({
      templatesEnabled: true,
      playbooksEnabled: options.playbooksEnabled ?? true,
      autoAttach: true,
      requiredStepsOnResolve: 'warn' as const,
    })),
  };

  const service = new PlaybooksService(
    prisma as never,
    authorizationLoader as never,
    configurationLoader as never,
  );

  return { service, prisma, changeLogs };
}

/**
 * Queues the exact answers `playbook.findFirst` should give, in call order,
 * and falls back to `null` (no clash) afterwards — so a leftover answer from an
 * earlier test can never satisfy a later lookup.
 */
function queueFindFirst(prisma: HarnessPrisma, ...values: readonly unknown[]): void {
  prisma.playbook.findFirst.mockReset();
  prisma.playbook.findFirst.mockImplementation(async () => null);
  for (const value of values) {
    prisma.playbook.findFirst.mockResolvedValueOnce(value);
  }
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

const input = (overrides: Record<string, unknown> = {}) => ({
  name: 'Mrežni kvar',
  steps: [{ title: 'Provjeri kabl', required: true }],
  reason: 'uveden playbook',
  ...overrides,
});

describe('PlaybooksService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('feature and permission gates', () => {
    it('reports the playbooks feature as off before anything else', async () => {
      const { service } = createHarness({ playbooksEnabled: false });
      expect(await codeOf(service.list({}, { actorUserId: 'actor-1' }))).toBe('PLAYBOOKS_DISABLED');
    });

    it('requires ticket.templates.manage', async () => {
      const { service } = createHarness({
        context: contextFor([permissionKeys.ticketTemplatesUse]),
      });
      expect(await codeOf(service.list({}, { actorUserId: 'actor-1' }))).toBe('FORBIDDEN');
      expect(await codeOf(service.create(input(), { actorUserId: 'actor-1' }))).toBe('FORBIDDEN');
    });

    it('treats an unknown actor as forbidden', async () => {
      const { service } = createHarness({ context: null });
      expect(await codeOf(service.get('playbook-1', { actorUserId: 'ghost' }))).toBe('FORBIDDEN');
    });
  });

  describe('list', () => {
    it('queries only live playbooks and translates the state and search filters', async () => {
      const { service, prisma } = createHarness();
      await service.list({ q: ' mreža ', state: 'inactive', serviceId: 'service-1' }, { actorUserId: 'actor-1' });
      const args = prisma.playbook.findMany.mock.calls[0][0] as {
        where: {
          deletedAt: null;
          isActive: boolean;
          services: { some: { serviceId: string } };
          name: { contains: string; mode: string };
        };
        orderBy: unknown;
        take: number;
      };
      expect(args.where.deletedAt).toBeNull();
      expect(args.where.isActive).toBe(false);
      expect(args.where.services).toEqual({ some: { serviceId: 'service-1' } });
      expect(args.where.name).toEqual({ contains: 'mreža', mode: 'insensitive' });
      expect(args.orderBy).toEqual({ name: 'asc' });
      expect(args.take).toBe(1000);
    });

    it('fills activeTicketCount from the checklist table and canEdit from the scope', async () => {
      const { service, prisma } = createHarness({
        context: contextFor([permissionKeys.ticketTemplatesManage], { serviceId: 'service-1' }),
      });
      prisma.playbook.findMany.mockResolvedValueOnce([
        row({ id: 'mine', services: [{ serviceId: 'service-1' }] }),
        row({ id: 'other', name: 'Tuđi', services: [{ serviceId: 'service-2' }] }),
      ]);
      prisma.ticketPlaybook.groupBy.mockResolvedValueOnce([
        { playbookId: 'mine', _count: { _all: 3 } },
      ]);
      const listed = await service.list({}, { actorUserId: 'actor-1' });
      expect(listed.map((item) => [item.id, item.activeTicketCount, item.canEdit])).toEqual([
        ['mine', 3, true],
        ['other', 0, false],
      ]);
      expect(prisma.ticketPlaybook.groupBy).toHaveBeenCalledWith({
        by: ['playbookId'],
        where: { playbookId: { in: ['mine', 'other'] }, detachedAt: null },
        _count: { _all: true },
      });
    });

    it('skips the counting query when the listing is empty', async () => {
      const { service, prisma } = createHarness();
      await expect(service.list({}, { actorUserId: 'actor-1' })).resolves.toEqual([]);
      expect(prisma.ticketPlaybook.groupBy).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('reports a missing playbook as not found', async () => {
      const { service } = createHarness();
      expect(await codeOf(service.get('missing', { actorUserId: 'actor-1' }))).toBe(
        'PLAYBOOK_NOT_FOUND',
      );
    });

    it('requires a reason', async () => {
      const { service } = createHarness();
      expect(await codeOf(service.create(input({ reason: '  ' }), { actorUserId: 'actor-1' }))).toBe(
        'REASON_REQUIRED',
      );
    });

    it('rejects a scope whose services or categories do not exist', async () => {
      const { service, prisma } = createHarness();
      prisma.service.count.mockResolvedValue(0);
      expect(
        await codeOf(
          service.create(input({ serviceIds: ['missing'] }), { actorUserId: 'actor-1' }),
        ),
      ).toBe('TEMPLATE_SCOPE_INVALID');
      expect(prisma.playbook.create).not.toHaveBeenCalled();
    });

    it('accepts only shared templates and existing articles as step references', async () => {
      const { service, prisma } = createHarness();
      prisma.responseTemplate.count.mockResolvedValue(0);
      expect(
        await codeOf(
          service.create(
            input({
              steps: [{ title: 'Korak', responseTemplateId: 'personal-template' }],
            }),
            { actorUserId: 'actor-1' },
          ),
        ),
      ).toBe('PLAYBOOK_REFERENCE_INVALID');
      // the reference is checked against shared, undeleted templates only
      expect(prisma.responseTemplate.count).toHaveBeenCalledWith({
        where: { id: { in: ['personal-template'] }, ownerUserId: null, deletedAt: null },
      });

      prisma.responseTemplate.count.mockResolvedValue(1);
      prisma.knowledgeArticle.count.mockResolvedValue(0);
      expect(
        await codeOf(
          service.create(
            input({ steps: [{ title: 'Korak', knowledgeArticleId: 'missing-article' }] }),
            { actorUserId: 'actor-1' },
          ),
        ),
      ).toBe('PLAYBOOK_REFERENCE_INVALID');
    });

    it('refuses a name another playbook already uses', async () => {
      const { service, prisma } = createHarness();
      queueFindFirst(prisma, { id: 'other' });
      expect(await codeOf(service.create(input(), { actorUserId: 'actor-1' }))).toBe(
        'PLAYBOOK_NAME_TAKEN',
      );
    });

    it('stops a service-restricted admin from writing an unscoped playbook', async () => {
      const { service } = createHarness({
        context: contextFor([permissionKeys.ticketTemplatesManage], { serviceId: 'service-1' }),
      });
      expect(
        await codeOf(
          service.create(input({ serviceIds: [] }), { actorUserId: 'actor-1' }),
        ),
      ).toBe('TEMPLATE_SCOPE_FORBIDDEN');
    });

    it('creates the steps in order, replaces the scope rows and writes an audit entry', async () => {
      const { service, prisma, changeLogs } = createHarness();
      queueFindFirst(prisma, null, null);
      prisma.playbook.create.mockResolvedValue(
        row({
          steps: [
            step({ stepKey: 'korak-a', position: 0 }),
            step({ stepKey: 'korak-b', position: 1, title: 'Drugi', required: false }),
          ],
        }),
      );
      const created = await service.create(
        input({
          serviceIds: ['service-1'],
          categoryIds: ['category-1'],
          steps: [
            { stepKey: 'korak-a', title: 'Prvi' },
            { stepKey: 'korak-b', title: 'Drugi', required: false },
          ],
        }),
        { actorUserId: 'actor-1' },
      );
      const createArgs = prisma.playbook.create.mock.calls[0][0] as {
        data: {
          createdById: string;
          services: { create: { serviceId: string }[] };
          categories: { create: { categoryId: string }[] };
          steps: { create: StepRow[] };
        };
      };
      expect(createArgs.data.createdById).toBe('actor-1');
      expect(createArgs.data.services.create).toEqual([{ serviceId: 'service-1' }]);
      expect(createArgs.data.categories.create).toEqual([{ categoryId: 'category-1' }]);
      expect(createArgs.data.steps.create.map((entry) => [entry.stepKey, entry.position])).toEqual([
        ['korak-a', 0],
        ['korak-b', 1],
      ]);
      expect(created.steps.map((item) => item.stepKey)).toEqual(['korak-a', 'korak-b']);
      expect(created.activeTicketCount).toBe(0);
      expect(changeLogs).toHaveLength(1);
      expect(changeLogs[0]).toMatchObject({
        entityType: 'playbook',
        reason: 'uveden playbook',
        actorUserId: 'actor-1',
      });
      expect((changeLogs[0].diff as { action: string }).action).toBe('create');
    });
  });

  describe('update', () => {
    it('bumps the version only when the steps a running checklist copies change', async () => {
      const { service, prisma, changeLogs } = createHarness();
      queueFindFirst(prisma, row({ version: 4 }), null);
      prisma.playbook.update.mockResolvedValueOnce(row({ version: 4, name: 'Novo ime' }));

      // the same step key and text: only the name changes, nothing a running
      // checklist copies, so the version must not move
      await service.update(
        'playbook-1',
        input({ name: 'Novo ime', steps: [{ stepKey: 'prvi-korak', title: 'Provjeri kabl', required: true }] }),
        { actorUserId: 'actor-1' },
      );
      const untouched = prisma.playbook.update.mock.calls[0][0] as { data: { version?: unknown } };
      expect(untouched.data.version).toBeUndefined();
      expect(prisma.playbookStep.upsert).toHaveBeenCalledTimes(1);
      expect(changeLogs).toHaveLength(1);
      expect((changeLogs[0].diff as { action: string }).action).toBe('update');

      queueFindFirst(prisma, row({ version: 4 }), null);
      prisma.playbook.update.mockResolvedValueOnce(row({ version: 5, steps: [step({ title: 'Novi tekst' })] }));
      await service.update(
        'playbook-1',
        input({ steps: [{ stepKey: 'prvi-korak', title: 'Novi tekst' }] }),
        { actorUserId: 'actor-1' },
      );
      const bumped = prisma.playbook.update.mock.calls[1][0] as {
        data: { version: { increment: number } };
      };
      expect(bumped.data.version).toEqual({ increment: 1 });
    });

    it('removes the scope rows and the steps that are no longer in the request', async () => {
      const { service, prisma } = createHarness();
      queueFindFirst(prisma, row(), null);
      prisma.playbook.update.mockResolvedValueOnce(row());
      await service.update(
        'playbook-1',
        input({ steps: [{ stepKey: 'prvi-korak', title: 'Provjeri kabl' }] }),
        { actorUserId: 'actor-1' },
      );
      expect(prisma.playbookService.deleteMany).toHaveBeenCalledWith({
        where: { playbookId: 'playbook-1' },
      });
      expect(prisma.playbookCategory.deleteMany).toHaveBeenCalledWith({
        where: { playbookId: 'playbook-1' },
      });
      expect(prisma.playbookStep.deleteMany).toHaveBeenCalledWith({
        where: { playbookId: 'playbook-1', stepKey: { notIn: ['prvi-korak'] } },
      });
      expect(prisma.playbookStep.upsert).toHaveBeenCalledWith({
        where: { playbookId_stepKey: { playbookId: 'playbook-1', stepKey: 'prvi-korak' } },
        create: expect.objectContaining({ stepKey: 'prvi-korak', playbookId: 'playbook-1' }),
        update: expect.objectContaining({ stepKey: 'prvi-korak' }),
      });
    });

    it('checks both the old and the new scope against what the actor may manage', async () => {
      const { service, prisma } = createHarness({
        context: contextFor([permissionKeys.ticketTemplatesManage], { serviceId: 'service-1' }),
      });
      queueFindFirst(prisma, row({ services: [{ serviceId: 'service-1' }] }));
      expect(
        await codeOf(
          service.update(
            'playbook-1',
            input({ serviceIds: ['service-2'] }),
            { actorUserId: 'actor-1' },
          ),
        ),
      ).toBe('TEMPLATE_SCOPE_FORBIDDEN');
      expect(prisma.playbook.update).not.toHaveBeenCalled();
    });

    it('keeps the audit entry ahead of the new snapshot', async () => {
      const { service, prisma, changeLogs } = createHarness();
      queueFindFirst(prisma, row({ version: 2, name: 'Staro' }), null);
      prisma.playbook.update.mockResolvedValueOnce(row({ version: 3, name: 'Novo' }));
      await service.update('playbook-1', input({ name: 'Novo' }), { actorUserId: 'actor-1' });
      const diff = changeLogs[0].diff as {
        before: { name: string; version: number };
        after: { name: string; version: number };
      };
      expect(diff.before).toMatchObject({ name: 'Staro', version: 2 });
      expect(diff.after).toMatchObject({ name: 'Novo', version: 3 });
      expect(changeLogs[0].reason).toBe('uveden playbook');
    });
  });

  describe('remove', () => {
    it('soft-deletes and audits, so a running checklist keeps its copy of the steps', async () => {
      const { service, prisma, changeLogs } = createHarness();
      queueFindFirst(prisma, row());
      const result = await service.remove('playbook-1', 'playbook ukinut', { actorUserId: 'actor-1' });
      expect(result).toEqual({ id: 'playbook-1' });
      const updateArgs = prisma.playbook.update.mock.calls[0][0] as {
        data: { deletedAt: Date; isActive: boolean };
      };
      expect(updateArgs.data.deletedAt).toBeInstanceOf(Date);
      expect(updateArgs.data.isActive).toBe(false);
      expect((changeLogs[0].diff as { action: string }).action).toBe('delete');
      expect(changeLogs[0].reason).toBe('playbook ukinut');
    });

    it('refuses to delete a playbook outside the managed scope', async () => {
      const { service, prisma } = createHarness({
        context: contextFor([permissionKeys.ticketTemplatesManage], { serviceId: 'service-1' }),
      });
      queueFindFirst(prisma, row({ services: [{ serviceId: 'service-9' }] }));
      expect(
        await codeOf(service.remove('playbook-1', 'playbook ukinut', { actorUserId: 'actor-1' })),
      ).toBe('TEMPLATE_SCOPE_FORBIDDEN');
      expect(prisma.playbook.update).not.toHaveBeenCalled();
    });
  });
});
