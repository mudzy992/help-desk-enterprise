import type { Prisma } from '../../generated/prisma/client';
import { createConfigSnapshotFixture } from './create-config-snapshot-fixture';
import type { ConfigPlaybookSnapshot, ConfigResponseTemplateSnapshot } from './config-versioning.types';
import { configVersioningErrorCodes } from './config-versioning.constants';
import { applyTemplatesSnapshot } from './apply-templates-snapshot';

type TemplateRow = {
  id: string;
  name: string;
  bodyBs: string;
  bodyEn: string | null;
  kind: 'REPLY' | 'INTERNAL' | 'ANY';
  tags: string[];
  isActive: boolean;
  ownerUserId: string | null;
  deletedAt: Date | null;
  updatedById: string | null;
  services: Array<{ serviceId: string }>;
  categories: Array<{ categoryId: string }>;
  groups: Array<{ groupId: string }>;
};

type StepRow = {
  id: string;
  stepKey: string;
  position: number;
  title: string;
  instructions: string | null;
  required: boolean;
  knowledgeArticleId: string | null;
  responseTemplateId: string | null;
};

type PlaybookRow = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  version: number;
  deletedAt: Date | null;
  updatedById: string | null;
  services: Array<{ serviceId: string }>;
  categories: Array<{ categoryId: string }>;
  steps: StepRow[];
};

type State = {
  responseTemplates: TemplateRow[];
  playbooks: PlaybookRow[];
  changeLogs: Array<Record<string, unknown>>;
};

type Fake = { transaction: Prisma.TransactionClient; state: State };

function templateRow(overrides: Partial<TemplateRow> = {}): TemplateRow {
  return {
    id: 'template-1',
    name: 'Old reply',
    bodyBs: 'Stara poruka',
    bodyEn: null,
    kind: 'ANY',
    tags: [],
    isActive: true,
    ownerUserId: null,
    deletedAt: null,
    updatedById: null,
    services: [{ serviceId: 'service-1' }],
    categories: [],
    groups: [],
    ...overrides,
  };
}

function playbookRow(overrides: Partial<PlaybookRow> = {}): PlaybookRow {
  return {
    id: 'playbook-1',
    name: 'Old checklist',
    description: null,
    isActive: true,
    version: 1,
    deletedAt: null,
    updatedById: null,
    services: [{ serviceId: 'service-1' }],
    categories: [],
    steps: [
      {
        id: 'step-row-1',
        stepKey: 'verify_access',
        position: 0,
        title: 'Old title',
        instructions: null,
        required: true,
        knowledgeArticleId: 'article-1',
        responseTemplateId: 'template-1',
      },
    ],
    ...overrides,
  };
}

function createFake(initial: Partial<State> = {}): Fake {
  const state: State = {
    responseTemplates: initial.responseTemplates?.map(cloneTemplate) ?? [templateRow()],
    playbooks: initial.playbooks?.map(clonePlaybook) ?? [playbookRow()],
    changeLogs: [],
  };
  const ids = (where: { readonly id?: { readonly in?: readonly string[] } }) => where.id?.in;
  const cloneTemplateResult = (row: TemplateRow) => cloneTemplate(row);
  const clonePlaybookResult = (row: PlaybookRow) => clonePlaybook(row);

  const transaction = {
    responseTemplate: {
      findMany: jest.fn(async (input: {
        readonly where?: { readonly id?: { readonly in?: readonly string[] }; readonly ownerUserId?: string | null; readonly deletedAt?: Date | null };
        readonly select?: Record<string, boolean>;
      }) => {
        const wantedIds = ids(input.where ?? {});
        const rows = state.responseTemplates.filter((row) =>
          (wantedIds === undefined || wantedIds.includes(row.id)) &&
          (input.where?.ownerUserId === undefined || row.ownerUserId === input.where.ownerUserId) &&
          (input.where?.deletedAt === undefined || row.deletedAt === input.where.deletedAt),
        );
        if (input.select?.ownerUserId === true) {
          return rows.map(({ id, ownerUserId, deletedAt }) => ({ id, ownerUserId, deletedAt }));
        }
        if (input.select?.name === true) return rows.map(({ id, name }) => ({ id, name }));
        return rows.map(cloneTemplateResult);
      }),
      findUnique: jest.fn(async (input: { readonly where: { readonly id: string } }) => {
        const row = state.responseTemplates.find((item) => item.id === input.where.id);
        return row === undefined ? null : cloneTemplateResult(row);
      }),
      updateMany: jest.fn(async (input: {
        readonly where: { readonly id: string; readonly ownerUserId: string | null };
        readonly data: Partial<TemplateRow>;
      }) => {
        const row = state.responseTemplates.find((item) =>
          item.id === input.where.id && item.ownerUserId === input.where.ownerUserId,
        );
        if (row === undefined) return { count: 0 };
        Object.assign(row, input.data);
        return { count: 1 };
      }),
    },
    responseTemplateService: {
      deleteMany: jest.fn(async ({ where }: { readonly where: { readonly templateId: string } }) => {
        const row = state.responseTemplates.find((item) => item.id === where.templateId);
        const count = row?.services.length ?? 0;
        if (row !== undefined) row.services = [];
        return { count };
      }),
      createMany: jest.fn(async ({ data }: { readonly data: Array<{ templateId: string; serviceId: string }> }) => {
        for (const item of data) state.responseTemplates.find((row) => row.id === item.templateId)?.services.push({ serviceId: item.serviceId });
        return { count: data.length };
      }),
    },
    responseTemplateCategory: {
      deleteMany: jest.fn(async ({ where }: { readonly where: { readonly templateId: string } }) => {
        const row = state.responseTemplates.find((item) => item.id === where.templateId);
        const count = row?.categories.length ?? 0;
        if (row !== undefined) row.categories = [];
        return { count };
      }),
      createMany: jest.fn(async ({ data }: { readonly data: Array<{ templateId: string; categoryId: string }> }) => {
        for (const item of data) state.responseTemplates.find((row) => row.id === item.templateId)?.categories.push({ categoryId: item.categoryId });
        return { count: data.length };
      }),
    },
    responseTemplateGroup: {
      deleteMany: jest.fn(async ({ where }: { readonly where: { readonly templateId: string } }) => {
        const row = state.responseTemplates.find((item) => item.id === where.templateId);
        const count = row?.groups.length ?? 0;
        if (row !== undefined) row.groups = [];
        return { count };
      }),
      createMany: jest.fn(async ({ data }: { readonly data: Array<{ templateId: string; groupId: string }> }) => {
        for (const item of data) state.responseTemplates.find((row) => row.id === item.templateId)?.groups.push({ groupId: item.groupId });
        return { count: data.length };
      }),
    },
    playbook: {
      findMany: jest.fn(async (input: {
        readonly where?: { readonly id?: { readonly in?: readonly string[] }; readonly deletedAt?: Date | null };
        readonly select?: Record<string, boolean>;
      }) => {
        const wantedIds = ids(input.where ?? {});
        const rows = state.playbooks.filter((row) =>
          (wantedIds === undefined || wantedIds.includes(row.id)) &&
          (input.where?.deletedAt === undefined || row.deletedAt === input.where.deletedAt),
        );
        if (input.select?.name === true) return rows.map(({ id, name }) => ({ id, name }));
        return rows.map(clonePlaybookResult);
      }),
      findUnique: jest.fn(async (input: { readonly where: { readonly id: string } }) => {
        const row = state.playbooks.find((item) => item.id === input.where.id);
        return row === undefined ? null : clonePlaybookResult(row);
      }),
      updateMany: jest.fn(async (input: {
        readonly where: { readonly id: string };
        readonly data: Record<string, unknown>;
      }) => {
        const row = state.playbooks.find((item) => item.id === input.where.id);
        if (row === undefined) return { count: 0 };
        const data = { ...input.data };
        const version = data.version;
        delete data.version;
        Object.assign(row, data);
        if (typeof version === 'object' && version !== null && 'increment' in version) {
          row.version += Number((version as { readonly increment: number }).increment);
        }
        return { count: 1 };
      }),
    },
    playbookService: {
      deleteMany: jest.fn(async ({ where }: { readonly where: { readonly playbookId: string } }) => {
        const row = state.playbooks.find((item) => item.id === where.playbookId);
        const count = row?.services.length ?? 0;
        if (row !== undefined) row.services = [];
        return { count };
      }),
      createMany: jest.fn(async ({ data }: { readonly data: Array<{ playbookId: string; serviceId: string }> }) => {
        for (const item of data) state.playbooks.find((row) => row.id === item.playbookId)?.services.push({ serviceId: item.serviceId });
        return { count: data.length };
      }),
    },
    playbookCategory: {
      deleteMany: jest.fn(async ({ where }: { readonly where: { readonly playbookId: string } }) => {
        const row = state.playbooks.find((item) => item.id === where.playbookId);
        const count = row?.categories.length ?? 0;
        if (row !== undefined) row.categories = [];
        return { count };
      }),
      createMany: jest.fn(async ({ data }: { readonly data: Array<{ playbookId: string; categoryId: string }> }) => {
        for (const item of data) state.playbooks.find((row) => row.id === item.playbookId)?.categories.push({ categoryId: item.categoryId });
        return { count: data.length };
      }),
    },
    playbookStep: {
      deleteMany: jest.fn(async ({ where }: { readonly where: { readonly playbookId: string; readonly stepKey: { readonly notIn: readonly string[] } } }) => {
        const row = state.playbooks.find((item) => item.id === where.playbookId);
        if (row === undefined) return { count: 0 };
        const before = row.steps.length;
        row.steps = row.steps.filter((step) => where.stepKey.notIn.includes(step.stepKey));
        return { count: before - row.steps.length };
      }),
      upsert: jest.fn(async (input: {
        readonly where: { readonly playbookId_stepKey: { readonly playbookId: string; readonly stepKey: string } };
        readonly create: Omit<StepRow, 'id'> & { readonly playbookId: string };
        readonly update: Omit<StepRow, 'id' | 'stepKey'>;
      }) => {
        const row = state.playbooks.find((item) => item.id === input.where.playbookId_stepKey.playbookId);
        if (row === undefined) throw new Error('playbook missing');
        const existing = row.steps.find((step) => step.stepKey === input.where.playbookId_stepKey.stepKey);
        if (existing !== undefined) Object.assign(existing, input.update);
        else row.steps.push({ id: `row-${input.create.stepKey}`, ...input.create });
        return existing ?? row.steps[row.steps.length - 1];
      }),
    },
    service: { count: jest.fn(async ({ where }: { readonly where: { readonly id: { readonly in: readonly string[] } } }) => where.id.in.filter((id) => ['service-1', 'service-2'].includes(id)).length) },
    serviceCategory: { count: jest.fn(async ({ where }: { readonly where: { readonly id: { readonly in: readonly string[] } } }) => where.id.in.filter((id) => id === 'category-1').length) },
    group: { count: jest.fn(async ({ where }: { readonly where: { readonly id: { readonly in: readonly string[] } } }) => where.id.in.filter((id) => id === 'group-1').length) },
    knowledgeArticle: { count: jest.fn(async ({ where }: { readonly where: { readonly id: { readonly in: readonly string[] } } }) => where.id.in.filter((id) => id === 'article-1').length) },
    changeLog: {
      create: jest.fn(async ({ data }: { readonly data: Record<string, unknown> }) => {
        state.changeLogs.push(data);
        return data;
      }),
    },
  };
  return { transaction: transaction as unknown as Prisma.TransactionClient, state };
}

function cloneTemplate(row: TemplateRow): TemplateRow {
  return {
    ...row,
    tags: [...row.tags],
    deletedAt: row.deletedAt === null ? null : new Date(row.deletedAt),
    services: row.services.map((item) => ({ ...item })),
    categories: row.categories.map((item) => ({ ...item })),
    groups: row.groups.map((item) => ({ ...item })),
  };
}

function clonePlaybook(row: PlaybookRow): PlaybookRow {
  return {
    ...row,
    deletedAt: row.deletedAt === null ? null : new Date(row.deletedAt),
    services: row.services.map((item) => ({ ...item })),
    categories: row.categories.map((item) => ({ ...item })),
    steps: row.steps.map((item) => ({ ...item })),
  };
}

function templateSnapshot(overrides: Partial<ConfigResponseTemplateSnapshot> = {}): ConfigResponseTemplateSnapshot {
  return {
    id: 'template-1',
    name: 'Restored reply',
    bodyBs: 'Pozdrav {ticketNumber}',
    bodyEn: 'Hello {ticketNumber}',
    kind: 'REPLY',
    tags: ['support'],
    isActive: true,
    deletedAt: null,
    scope: {
      serviceIds: ['service-2'],
      categoryIds: ['category-1'],
      groupIds: ['group-1'],
    },
    ...overrides,
  };
}

function playbookSnapshot(overrides: Partial<ConfigPlaybookSnapshot> = {}): ConfigPlaybookSnapshot {
  return {
    id: 'playbook-1',
    name: 'Restored checklist',
    description: 'Configuration restoration checklist',
    isActive: true,
    version: 1,
    deletedAt: null,
    scope: { serviceIds: ['service-2'], categoryIds: ['category-1'] },
    steps: [
      {
        stepKey: 'verify_access',
        position: 0,
        title: 'Verify new access',
        instructions: 'Confirm the target account can sign in.',
        required: true,
        knowledgeArticleId: 'article-1',
        responseTemplateId: 'template-1',
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
    ...overrides,
  };
}

describe('applyTemplatesSnapshot (BA-templates-06)', () => {
  it('restores shared headers, scopes and ordered steps, increments version and records actor/reason', async () => {
    const personal = templateRow({ id: 'personal-1', name: 'Personal reply', ownerUserId: 'user-1' });
    const fake = createFake({ responseTemplates: [templateRow(), personal] });
    const snapshot = createConfigSnapshotFixture({
      templates: {
        responseTemplates: [templateSnapshot(), { ...templateSnapshot({ id: 'personal-1', name: 'Should not apply' }) }],
        playbooks: [playbookSnapshot()],
      },
    });

    const applied = await applyTemplatesSnapshot(fake.transaction, snapshot, {
      reason: 'Restore approved template configuration',
      actorUserId: 'actor-1',
    });

    expect(fake.state.responseTemplates.find((row) => row.id === 'template-1')).toMatchObject({
      name: 'Restored reply',
      bodyBs: 'Pozdrav {ticketNumber}',
      kind: 'REPLY',
      updatedById: 'actor-1',
      services: [{ serviceId: 'service-2' }],
      categories: [{ categoryId: 'category-1' }],
      groups: [{ groupId: 'group-1' }],
    });
    expect(fake.state.responseTemplates.find((row) => row.id === 'personal-1')).toMatchObject({
      name: 'Personal reply',
      ownerUserId: 'user-1',
    });
    expect(fake.state.playbooks[0]).toMatchObject({
      name: 'Restored checklist',
      version: 2,
      updatedById: 'actor-1',
      services: [{ serviceId: 'service-2' }],
      categories: [{ categoryId: 'category-1' }],
      steps: [
        {
          stepKey: 'verify_access',
          position: 0,
          title: 'Verify new access',
          instructions: 'Confirm the target account can sign in.',
          required: true,
          knowledgeArticleId: 'article-1',
          responseTemplateId: 'template-1',
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
    });
    expect(fake.state.changeLogs).toHaveLength(2);
    expect(fake.state.changeLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entityType: 'response_template', entityId: 'template-1', reason: 'Restore approved template configuration', actorUserId: 'actor-1' }),
        expect.objectContaining({ entityType: 'playbook', entityId: 'playbook-1', reason: 'Restore approved template configuration', actorUserId: 'actor-1' }),
      ]),
    );
    expect(applied?.playbooks[0]?.version).toBe(2);
    expect(applied?.responseTemplates.find((row) => row.id === 'template-1')?.scope).toEqual({
      serviceIds: ['service-2'],
      categoryIds: ['category-1'],
      groupIds: ['group-1'],
    });
  });

  it('rejects missing scope references before changing any row or writing audit', async () => {
    const fake = createFake();
    const snapshot = createConfigSnapshotFixture({
      templates: {
        responseTemplates: [templateSnapshot({
          name: 'Should stay unchanged',
          scope: { serviceIds: ['missing-service'], categoryIds: [], groupIds: [] },
        })],
        playbooks: [playbookSnapshot({ steps: undefined })],
      },
    });

    await expect(applyTemplatesSnapshot(fake.transaction, snapshot, {
      reason: 'Restore invalid configuration',
      actorUserId: 'actor-1',
    })).rejects.toMatchObject({ code: configVersioningErrorCodes.templatesInvariantViolation });
    expect(fake.state.responseTemplates[0]?.name).toBe('Old reply');
    expect(fake.state.playbooks[0]?.version).toBe(1);
    expect(fake.state.changeLogs).toHaveLength(0);
  });

  it('rejects a new playbook reference to a personal template transactionally', async () => {
    const personal = templateRow({ id: 'personal-1', name: 'Personal only', ownerUserId: 'user-1' });
    const fake = createFake({ responseTemplates: [templateRow(), personal] });
    const snapshot = createConfigSnapshotFixture({
      templates: {
        responseTemplates: [templateSnapshot({ name: 'Should stay unchanged' })],
        playbooks: [playbookSnapshot({
          steps: [{
            stepKey: 'verify_access',
            position: 0,
            title: 'Verify new access',
            instructions: null,
            required: true,
            knowledgeArticleId: null,
            responseTemplateId: 'personal-1',
          }],
        })],
      },
    });

    await expect(applyTemplatesSnapshot(fake.transaction, snapshot, {
      reason: 'Restore invalid reference',
      actorUserId: 'actor-1',
    })).rejects.toMatchObject({ code: configVersioningErrorCodes.templatesInvariantViolation });
    expect(fake.state.responseTemplates[0]?.name).toBe('Old reply');
    expect(fake.state.changeLogs).toHaveLength(0);
  });

  it('keeps scope, steps and monotonic version for a legacy header-only snapshot', async () => {
    const fake = createFake();
    const originalServices = fake.state.playbooks[0]!.services.map((entry) => ({ ...entry }));
    const originalSteps = fake.state.playbooks[0]!.steps.map((step) => ({ ...step }));
    const snapshot = createConfigSnapshotFixture({
      templates: {
        responseTemplates: [templateSnapshot({ scope: undefined })],
        playbooks: [playbookSnapshot({ scope: undefined, steps: undefined, version: undefined })],
      },
    });

    const applied = await applyTemplatesSnapshot(fake.transaction, snapshot, {
      reason: 'Restore legacy snapshot',
      actorUserId: null,
    });

    expect(fake.state.playbooks[0]?.version).toBe(1);
    expect(fake.state.playbooks[0]?.services).toEqual(originalServices);
    expect(fake.state.playbooks[0]?.steps).toEqual(originalSteps);
    expect(applied?.playbooks[0]?.version).toBe(1);
    expect(fake.state.responseTemplates[0]?.services).toEqual([{ serviceId: 'service-1' }]);
  });
});
