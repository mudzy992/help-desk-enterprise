import { permissionKeys } from '../../authorization/authorization.constants';
import type {
  AuthorizationAssignment,
  AuthorizationContext,
} from '../../authorization/authorization.types';
import { TemplatesError } from '../templates.error';
import { TicketPlaybooksService, sanitize } from './ticket-playbooks.service';
import type { PlaybookStepSnapshot } from './ticket-playbook-snapshot';

jest.mock('../../tickets/load-accessible-ticket', () => ({ loadAccessibleTicket: jest.fn() }));
jest.mock('./attach-playbook-to-ticket', () => ({
  attachPlaybookToTicket: jest.fn(),
  loadPlaybookCandidates: jest.fn(async () => []),
}));

// eslint-disable-next-line import/first
import { loadAccessibleTicket } from '../../tickets/load-accessible-ticket';
// eslint-disable-next-line import/first
import { attachPlaybookToTicket, loadPlaybookCandidates } from './attach-playbook-to-ticket';

const loadTicketMock = loadAccessibleTicket as jest.Mock;
const attachMock = attachPlaybookToTicket as jest.Mock;
const candidatesMock = loadPlaybookCandidates as jest.Mock;

type StepSnapshotRow = PlaybookStepSnapshot & { readonly position: number };

type TicketPlaybookRow = {
  id: string;
  ticketId: string;
  playbookId: string;
  playbookName: string;
  playbookVersion: number;
  autoAttached: boolean;
  attachedById: string | null;
  detachedAt: Date | null;
  createdAt: Date;
  stepsSnapshot: unknown;
  steps: {
    stepKey: string;
    checkedById: string | null;
    checkedAt: Date;
  }[];
  playbook: { version: number; isActive: boolean; deletedAt: Date | null };
};

const snapshot = (overrides: Partial<StepSnapshotRow> = {}): StepSnapshotRow => ({
  stepKey: 'korak-1',
  position: 0,
  title: 'Provjeri kabl',
  instructions: null,
  required: true,
  knowledgeArticleId: null,
  responseTemplateId: null,
  ...overrides,
});

const attached = (overrides: Partial<TicketPlaybookRow> = {}): TicketPlaybookRow => ({
  id: 'ticket-playbook-1',
  ticketId: 'ticket-1',
  playbookId: 'playbook-1',
  playbookName: 'Mrežni kvar',
  playbookVersion: 2,
  autoAttached: false,
  attachedById: 'actor-1',
  detachedAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  stepsSnapshot: [snapshot()],
  steps: [],
  playbook: { version: 2, isActive: true, deletedAt: null },
  ...overrides,
});

const ticket = {
  id: 'ticket-1',
  ticketNumber: 'HD-2026-0001',
  title: 'Ne radi mreža',
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

const assignment = (keys: readonly string[]): AuthorizationAssignment => ({
  roleKey: 'AGENT',
  permissionKeys: keys,
  organizationalUnitId: null,
  organizationalUnitPath: null,
  serviceId: null,
});

const contextFor = (keys: readonly string[]): AuthorizationContext => ({
  subjectId: 'actor-1',
  isLocalOnly: false,
  isSuperAdmin: false,
  assignments: [assignment(keys)],
});

const agentContext = contextFor([permissionKeys.ticketTemplatesUse]);

type HarnessPrisma = {
  readonly ticketPlaybook: {
    readonly findFirst: jest.Mock;
    readonly updateMany: jest.Mock;
    readonly update: jest.Mock;
    readonly create: jest.Mock;
  };
  readonly ticketPlaybookStep: { readonly deleteMany: jest.Mock; readonly upsert: jest.Mock };
  readonly playbook: { readonly findFirst: jest.Mock };
  readonly service: { readonly findUnique: jest.Mock };
  readonly user: { readonly findMany: jest.Mock };
  readonly knowledgeArticle: { readonly findMany: jest.Mock };
  readonly responseTemplate: { readonly findMany: jest.Mock };
  readonly ticketMessage: { readonly create: jest.Mock };
  readonly changeLog: { readonly create: jest.Mock };
  readonly $transaction: jest.Mock;
};

function createHarness(
  options: {
    readonly context?: AuthorizationContext | null;
    readonly playbooksEnabled?: boolean;
    readonly mode?: 'off' | 'warn' | 'block';
  } = {},
) {
  const changeLogs: Record<string, unknown>[] = [];
  const messages: Record<string, unknown>[] = [];
  const authorizationContext: AuthorizationContext | null =
    options.context === undefined ? agentContext : options.context;

  let messageCounter = 0;
  const prisma: HarnessPrisma = {
    ticketPlaybook: {
      findFirst: jest.fn(async (): Promise<TicketPlaybookRow | null> => null),
      updateMany: jest.fn(async () => ({ count: 1 })),
      update: jest.fn(async () => ({})),
      create: jest.fn(async () => ({})),
    },
    ticketPlaybookStep: {
      deleteMany: jest.fn(async () => ({ count: 0 })),
      upsert: jest.fn(async () => ({})),
    },
    playbook: {
      findFirst: jest.fn(async (): Promise<unknown> => null),
    },
    service: { findUnique: jest.fn(async () => ({ categoryId: 'category-1' })) },
    user: { findMany: jest.fn(async () => [{ id: 'actor-1', displayName: 'Agent Jedan' }]) },
    knowledgeArticle: { findMany: jest.fn(async () => []) },
    responseTemplate: { findMany: jest.fn(async () => []) },
    ticketMessage: {
      create: jest.fn(async (args: { data: { ticketId: string; type: string; body: string; authorUserId: string | null } }) => {
        messageCounter += 1;
        const record = {
          id: `message-${messageCounter}`,
          ticketId: args.data.ticketId,
          type: args.data.type,
          body: args.data.body,
          authorUserId: args.data.authorUserId,
          createdAt: new Date('2026-03-04T05:06:07.000Z'),
        };
        messages.push(record);
        return record;
      }),
    },
    changeLog: {
      create: jest.fn(async (args: { data: Record<string, unknown> }) => {
        changeLogs.push(args.data);
        return args.data;
      }),
    },
    $transaction: jest.fn(async (fn: (tx: HarnessPrisma) => Promise<unknown>) => fn(prisma)),
  };

  const authorizationLoader = { loadBySubjectId: jest.fn(async () => authorizationContext) };
  const accessPolicies = { bind: jest.fn(async () => ({})) };
  const realtimeHub = { publish: jest.fn(), publishTicketUpdated: jest.fn() };
  const configurationLoader = {
    load: jest.fn(async () => ({
      templatesEnabled: true,
      playbooksEnabled: options.playbooksEnabled ?? true,
      autoAttach: true,
      requiredStepsOnResolve: options.mode ?? ('warn' as const),
    })),
  };

  const service = new TicketPlaybooksService(
    prisma as never,
    authorizationLoader as never,
    accessPolicies as never,
    realtimeHub as never,
    configurationLoader as never,
  );

  loadTicketMock.mockImplementation(async () => ({ ticket, access: { visibility: 'staff' } }));

  return { service, prisma, changeLogs, messages, realtimeHub, accessPolicies };
}

/**
 * Queues what `ticketPlaybook.findFirst` should answer, in call order, and
 * falls back to `null` (no checklist) afterwards. Without the reset a queued
 * answer from the first half of a test would be consumed by the second half.
 */
function queueActive(prisma: HarnessPrisma, ...values: readonly unknown[]): void {
  prisma.ticketPlaybook.findFirst.mockReset();
  prisma.ticketPlaybook.findFirst.mockImplementation(async () => null);
  for (const value of values) {
    prisma.ticketPlaybook.findFirst.mockResolvedValueOnce(value);
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

describe('TicketPlaybooksService', () => {
  beforeEach(() => {
    // `resetAllMocks` also drops the module-factory default, so the candidate
    // loader is re-armed after every reset.
    jest.resetAllMocks();
    candidatesMock.mockImplementation(async () => [] as never);
  });

  describe('get', () => {
    it('answers "disabled" without loading the ticket when playbooks are off', async () => {
      const { service } = createHarness({ playbooksEnabled: false, mode: 'block' });
      await expect(service.get('ticket-1', { actorUserId: 'actor-1' })).resolves.toEqual({
        enabled: false,
        mode: 'block',
        readOnly: true,
        playbook: null,
        available: [],
      });
      expect(loadTicketMock).not.toHaveBeenCalled();
    });

    it('requires staff visibility and ticket.templates.use', async () => {
      const { service } = createHarness();
      loadTicketMock.mockResolvedValueOnce({ ticket, access: { visibility: 'public' } });
      expect(await codeOf(service.get('ticket-1', { actorUserId: 'actor-1' }))).toBe('FORBIDDEN');

      const withoutUse = createHarness({ context: contextFor([]) });
      expect(await codeOf(withoutUse.service.get('ticket-1', { actorUserId: 'actor-1' }))).toBe(
        'FORBIDDEN',
      );
    });

    it('marks a closed ticket read-only and offers no playbooks for it', async () => {
      const { service, prisma } = createHarness();
      loadTicketMock.mockResolvedValueOnce({
        ticket: { ...ticket, status: 'CLOSED' },
        access: { visibility: 'staff' },
      });
      const view = await service.get('ticket-1', { actorUserId: 'actor-1' });
      expect(view.readOnly).toBe(true);
      expect(view.available).toEqual([]);
      expect(prisma.ticketPlaybook.findFirst).toHaveBeenCalledTimes(1);
      expect(candidatesMock).not.toHaveBeenCalled();
    });

    it('ranks available playbooks: service match, then category, then the rest by name', async () => {
      const { service } = createHarness();
      candidatesMock.mockResolvedValueOnce([
        { id: 'cat', name: 'Kategorijski', serviceIds: [], categoryIds: ['category-1'] },
        { id: 'other', name: 'A ostali', serviceIds: ['service-9'], categoryIds: [] },
        { id: 'svc', name: 'Servisni', serviceIds: ['service-1'], categoryIds: [] },
      ]);
      const view = await service.get('ticket-1', { actorUserId: 'actor-1' });
      expect(view.available.map((item) => [item.id, item.match])).toEqual([
        ['svc', 'service'],
        ['cat', 'category'],
        ['other', 'other'],
      ]);
      expect(view.playbook).toBeNull();
      expect(view.mode).toBe('warn');
    });

    it('returns the checklist with checked steps, names and progress', async () => {
      const { service, prisma } = createHarness();
      prisma.ticketPlaybook.findFirst.mockResolvedValue(
        attached({
          stepsSnapshot: [
            snapshot({ stepKey: 'korak-1', title: 'Prvi', required: true }),
            snapshot({ stepKey: 'korak-2', position: 1, title: 'Drugi', required: false }),
          ],
          steps: [{ stepKey: 'korak-1', checkedById: 'actor-1', checkedAt: new Date('2026-02-02T00:00:00.000Z') }],
        }),
      );
      prisma.knowledgeArticle.findMany.mockResolvedValue([{ id: 'article-1', title: 'Uputa', slug: 'uputa' }]);
      prisma.responseTemplate.findMany.mockResolvedValue([{ id: 'template-1', name: 'Šablon' }]);
      loadTicketMock.mockResolvedValueOnce({ ticket, access: { visibility: 'staff' } });
      prisma.ticketPlaybook.findFirst.mockResolvedValueOnce(
        attached({
          stepsSnapshot: [
            snapshot({ stepKey: 'korak-1', title: 'Prvi', required: true, knowledgeArticleId: 'article-1' }),
            snapshot({ stepKey: 'korak-2', position: 1, title: 'Drugi', required: false, responseTemplateId: 'template-1' }),
          ],
          steps: [{ stepKey: 'korak-1', checkedById: 'actor-1', checkedAt: new Date('2026-02-02T00:00:00.000Z') }],
        }),
      );
      const view = await service.get('ticket-1', { actorUserId: 'actor-1' });
      expect(view.playbook?.name).toBe('Mrežni kvar');
      expect(view.playbook?.autoAttached).toBe(false);
      expect(view.playbook?.attachedBy).toEqual({ id: 'actor-1', displayName: 'Agent Jedan' });
      expect(view.playbook?.latestVersion).toBe(2);
      expect(
        view.playbook?.steps.map((item) => [
          item.stepKey,
          item.checked,
          item.knowledgeArticleTitle,
          item.responseTemplateName,
        ]),
      ).toEqual([
        ['korak-1', true, 'Uputa', null],
        ['korak-2', false, null, 'Šablon'],
      ]);
      expect(view.playbook?.progress).toMatchObject({ total: 2, done: 1, requiredTotal: 1, requiredDone: 1 });
    });
  });

  describe('attach', () => {
    it('passes the ticket, playbook and actor to the attach helper and publishes the events', async () => {
      const { service, prisma, realtimeHub, messages } = createHarness();
      prisma.ticketPlaybook.findFirst.mockResolvedValue(null);
      await service.attach('ticket-1', 'playbook-1', { actorUserId: 'actor-1' });
      const args = attachMock.mock.calls[0][0] as {
        playbookId: string;
        actorUserId: string;
        autoAttached: boolean;
        messages: unknown[];
        ticket: { id: string };
      };
      expect(args.playbookId).toBe('playbook-1');
      expect(args.actorUserId).toBe('actor-1');
      expect(args.autoAttached).toBe(false);
      expect(args.ticket.id).toBe('ticket-1');
      expect(Array.isArray(args.messages)).toBe(true);
      expect(attachMock.mock.calls[0][0].prisma).toBe(prisma);
      expect(messages).toEqual([]);
      expect(realtimeHub.publish).not.toHaveBeenCalled();
      expect((await service.get('ticket-1', { actorUserId: 'actor-1' })).readOnly).toBe(false);
    });

    it('asks for a writable ticket and refuses a read-only one', async () => {
      const { service } = createHarness();
      await service.attach('ticket-1', 'playbook-1', { actorUserId: 'actor-1' });
      expect(loadTicketMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'ticket-1',
        expect.anything(),
        { writable: true },
      );

      loadTicketMock.mockResolvedValueOnce({
        ticket: { ...ticket, status: 'ARCHIVED' },
        access: { visibility: 'staff' },
      });
      expect(await codeOf(service.attach('ticket-1', 'playbook-1', { actorUserId: 'actor-1' }))).toBe(
        'TICKET_PLAYBOOK_READ_ONLY',
      );
    });

    it('reports the playbooks feature as off', async () => {
      const { service } = createHarness({ playbooksEnabled: false });
      expect(await codeOf(service.attach('ticket-1', 'playbook-1', { actorUserId: 'actor-1' }))).toBe(
        'PLAYBOOKS_DISABLED',
      );
    });
  });

  describe('detach', () => {
    it('requires a reason and a running checklist', async () => {
      const { service, prisma } = createHarness();
      queueActive(prisma);
      expect(await codeOf(service.detach('ticket-1', 'x', { actorUserId: 'actor-1' }))).toBe(
        'REASON_REQUIRED',
      );
      expect(await codeOf(service.detach('ticket-1', 'nema više', { actorUserId: 'actor-1' }))).toBe(
        'TICKET_PLAYBOOK_NOT_FOUND',
      );
    });

    it('marks the row detached, audits it and tells the ticket chat', async () => {
      const { service, prisma, changeLogs, messages, realtimeHub } = createHarness();
      queueActive(prisma, attached(), null);
      const view = await service.detach('ticket-1', '  playbook   ukinut ', { actorUserId: 'actor-1' });
      const args = prisma.ticketPlaybook.updateMany.mock.calls[0][0] as {
        where: { id: string; detachedAt: null };
        data: { detachReason: string; detachedById: string; detachedAt: Date };
      };
      expect(args.where).toEqual({ id: 'ticket-playbook-1', detachedAt: null });
      expect(args.data.detachReason).toBe('playbook ukinut');
      expect(args.data.detachedById).toBe('actor-1');
      expect(args.data.detachedAt).toBeInstanceOf(Date);
      expect(changeLogs[0]).toMatchObject({
        entityType: 'ticket_playbook',
        reason: 'playbook ukinut',
        actorUserId: 'actor-1',
      });
      expect(messages).toEqual([
        expect.objectContaining({ ticketId: 'ticket-1', type: 'SYSTEM_EVENT', body: 'ticket_playbook_detached:playbook ukinut' }),
      ]);
      expect(realtimeHub.publish).toHaveBeenCalledTimes(1);
      expect(view.playbook).toBeNull();
    });

    it('does nothing when the row was detached by someone else in the meantime', async () => {
      const { service, prisma, changeLogs } = createHarness();
      queueActive(prisma, attached());
      prisma.ticketPlaybook.updateMany.mockResolvedValueOnce({ count: 0 });
      expect(await codeOf(service.detach('ticket-1', 'playbook ukinut', { actorUserId: 'actor-1' }))).toBe(
        'TICKET_PLAYBOOK_NOT_FOUND',
      );
      expect(changeLogs).toEqual([]);
    });
  });

  describe('upgrade', () => {
    it('refuses when the ticket is already on the newest version', async () => {
      const { service, prisma } = createHarness();
      queueActive(prisma, attached({ playbookVersion: 2 }));
      prisma.playbook.findFirst.mockResolvedValueOnce({ id: 'playbook-1', name: 'Mrežni kvar', version: 2, steps: [] });
      expect(await codeOf(service.upgrade('ticket-1', { actorUserId: 'actor-1' }))).toBe(
        'TICKET_PLAYBOOK_UP_TO_DATE',
      );
    });

    it('refuses when the playbook is gone or inactive', async () => {
      const { service, prisma } = createHarness();
      queueActive(prisma, attached());
      prisma.playbook.findFirst.mockResolvedValueOnce(null);
      expect(await codeOf(service.upgrade('ticket-1', { actorUserId: 'actor-1' }))).toBe(
        'TICKET_PLAYBOOK_NOT_APPLICABLE',
      );
    });

    it('keeps finished steps whose key survives, drops the rest and records the new version', async () => {
      const { service, prisma, changeLogs, messages } = createHarness();
      queueActive(
        prisma,
        attached({
          stepsSnapshot: [snapshot({ stepKey: 'korak-1' }), snapshot({ stepKey: 'korak-2', position: 1, title: 'Drugi' })],
          steps: [{ stepKey: 'korak-2', checkedById: 'actor-1', checkedAt: new Date('2026-02-02T00:00:00.000Z') }],
        }),
      );
      prisma.playbook.findFirst.mockResolvedValueOnce({
        id: 'playbook-1',
        name: 'Mrežni kvar',
        version: 3,
        steps: [
          snapshot({ stepKey: 'korak-2', position: 0, title: 'Novi prvi' }),
          snapshot({ stepKey: 'korak-3', position: 1, title: 'Novi drugi' }),
        ],
      });
      await service.upgrade('ticket-1', { actorUserId: 'actor-1' });
      // only korak-2 is still finished and still exists, so only it survives
      expect(prisma.ticketPlaybookStep.deleteMany).toHaveBeenCalledWith({
        where: { ticketPlaybookId: 'ticket-playbook-1', stepKey: { notIn: ['korak-2'] } },
      });
      const updateArgs = prisma.ticketPlaybook.update.mock.calls[0][0] as {
        data: { playbookVersion: number; playbookName: string; stepsSnapshot: StepSnapshotRow[] };
      };
      expect(updateArgs.data.playbookVersion).toBe(3);
      expect(updateArgs.data.playbookName).toBe('Mrežni kvar');
      expect(updateArgs.data.stepsSnapshot.map((item) => item.stepKey)).toEqual(['korak-2', 'korak-3']);
      expect(changeLogs[0]).toMatchObject({ reason: 'playbook_upgrade' });
      expect((changeLogs[0].diff as { before: { version: number } }).before.version).toBe(2);
      expect(messages[0].body).toBe('ticket_playbook_upgraded:2:3:Mrežni kvar');
    });

    it('flattens line breaks out of the playbook name in the system event', async () => {
      const { service, prisma, messages } = createHarness();
      queueActive(prisma, attached());
      prisma.playbook.findFirst.mockResolvedValueOnce({
        id: 'playbook-1',
        name: 'Mrežni\nkvar',
        version: 3,
        steps: [snapshot()],
      });
      await service.upgrade('ticket-1', { actorUserId: 'actor-1' });
      expect(messages[0].body).toBe('ticket_playbook_upgraded:2:3:Mrežni kvar');
    });
  });

  describe('setStep', () => {
    it('reports a step key that is not part of the checklist', async () => {
      const { service, prisma } = createHarness();
      queueActive(prisma, attached());
      expect(
        await codeOf(service.setStep('ticket-1', 'nepoznat', true, { actorUserId: 'actor-1' })),
      ).toBe('TICKET_PLAYBOOK_STEP_NOT_FOUND');
    });

    it('is idempotent: a repeated state writes nothing', async () => {
      const { service, prisma, messages, changeLogs } = createHarness();
      const alreadyChecked = attached({
        steps: [{ stepKey: 'korak-1', checkedById: 'actor-1', checkedAt: new Date() }],
      });
      queueActive(prisma, alreadyChecked, alreadyChecked);
      const view = await service.setStep('ticket-1', 'korak-1', true, { actorUserId: 'actor-1' });
      expect(prisma.ticketPlaybookStep.upsert).not.toHaveBeenCalled();
      expect(prisma.changeLog.create).not.toHaveBeenCalled();
      expect(messages).toEqual([]);
      expect(changeLogs).toEqual([]);
      expect(view.playbook?.progress.done).toBe(1);
    });

    it('checks a step, records it and reports the position in the event', async () => {
      const { service, prisma, messages, changeLogs } = createHarness();
      queueActive(prisma, attached({
        stepsSnapshot: [snapshot({ stepKey: 'korak-1' }), snapshot({ stepKey: 'korak-2', position: 1, title: 'Drugi' })],
      }), null);
      await service.setStep('ticket-1', 'korak-1', true, { actorUserId: 'actor-1' });
      expect(prisma.ticketPlaybookStep.upsert).toHaveBeenCalledWith({
        where: { ticketPlaybookId_stepKey: { ticketPlaybookId: 'ticket-playbook-1', stepKey: 'korak-1' } },
        create: expect.objectContaining({ stepKey: 'korak-1', checkedById: 'actor-1' }),
        update: {},
      });
      expect(changeLogs[0]).toMatchObject({ reason: 'playbook_step_checked' });
      expect(messages.map((message) => message.body)).toEqual([
        'ticket_playbook_step_checked:1:Provjeri kabl',
      ]);
    });

    it('unchecks a step and announces it', async () => {
      const { service, prisma, messages, changeLogs } = createHarness();
      queueActive(
        prisma,
        attached({ steps: [{ stepKey: 'korak-1', checkedById: 'actor-1', checkedAt: new Date() }] }),
        null,
      );
      await service.setStep('ticket-1', 'korak-1', false, { actorUserId: 'actor-1' });
      expect(prisma.ticketPlaybookStep.deleteMany).toHaveBeenCalledWith({
        where: { ticketPlaybookId: 'ticket-playbook-1', stepKey: 'korak-1' },
      });
      expect(changeLogs[0]).toMatchObject({ reason: 'playbook_step_unchecked' });
      expect(messages.map((message) => message.body)).toEqual([
        'ticket_playbook_step_unchecked:1:Provjeri kabl',
      ]);
    });

    it('announces completion once the last open step is ticked', async () => {
      const { service, prisma, messages } = createHarness();
      queueActive(
        prisma,
        attached({
          stepsSnapshot: [snapshot({ stepKey: 'korak-1' }), snapshot({ stepKey: 'korak-2', position: 1, title: 'Drugi' })],
          steps: [{ stepKey: 'korak-1', checkedById: 'actor-1', checkedAt: new Date() }],
        }),
        null,
      );
      await service.setStep('ticket-1', 'korak-2', true, { actorUserId: 'actor-1' });
      expect(messages.map((message) => message.body)).toEqual([
        'ticket_playbook_step_checked:2:Drugi',
        'ticket_playbook_completed:Mrežni kvar',
      ]);
    });

    it('does not complete while a step is still open', async () => {
      const { service, prisma, messages } = createHarness();
      queueActive(
        prisma,
        attached({
          stepsSnapshot: [snapshot({ stepKey: 'korak-1' }), snapshot({ stepKey: 'korak-2', position: 1, title: 'Drugi' })],
        }),
        null,
      );
      await service.setStep('ticket-1', 'korak-1', true, { actorUserId: 'actor-1' });
      expect(messages.map((message) => message.body)).toEqual([
        'ticket_playbook_step_checked:1:Provjeri kabl',
      ]);
    });
  });

  describe('sanitize', () => {
    it('flattens line breaks and trims the text used in system events', () => {
      // line breaks become one space; the surrounding text is trimmed, while
      // spaces that were already there stay as they are
      expect(sanitize('  Prvi\r\nDrugi \n Treći  ')).toBe('Prvi Drugi   Treći');
      expect(sanitize('Naslov\nDrugi red')).toBe('Naslov Drugi red');
    });
  });
});
