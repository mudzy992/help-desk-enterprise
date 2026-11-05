jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));
jest.mock('../../common/outbox/transactional-outbox.service', () => ({
  TransactionalOutboxService: class TransactionalOutboxService {},
}));
jest.mock('../sla/ticket-sla-timers.service', () => ({
  TicketSlaTimersService: class TicketSlaTimersService {},
}));
jest.mock('../templates/templates-configuration.loader', () => ({
  TemplatesConfigurationLoader: class TemplatesConfigurationLoader {},
}));
jest.mock('../templates/ticket-playbooks/attach-playbook-to-ticket', () => ({
  autoAttachPlaybook: jest.fn(),
}));

import type {
  OutboxDelivery,
  OutboxHandler,
} from '../../common/outbox/transactional-outbox.service';
import { autoAttachPlaybook } from '../templates/ticket-playbooks/attach-playbook-to-ticket';
import { TemplatesError } from '../templates/templates.error';
import { ticketPlaybookAutoAttachTopic, ticketSlaEffectsTopic } from './ticket-side-effect-outbox.constants';
import { TicketSideEffectOutboxReconciler } from './ticket-side-effect-outbox-reconciler.service';
import type { TicketRecord } from './tickets.types';

describe('TicketSideEffectOutboxReconciler SLA delivery', () => {
  const eventCases: readonly (readonly [string, Readonly<Record<string, unknown>>, string])[] = [
    ['first agent reply', { event: 'agent_replied' }, 'agent_replied'],
    ['status trigger', { statusChanged: true, priorityChanged: false }, 'status_changed'],
    ['priority trigger', { statusChanged: false, priorityChanged: true }, 'priority_changed'],
  ];

  it.each(eventCases)('routes the %s event to the SLA timer', async (_label, fields, expectedEvent) => {
    const occurredAt = new Date('2026-11-04T12:34:56.000Z');
    const ticket = {
      id: 'ticket-00000001',
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      serviceId: 'service-00000001',
      originUnitId: 'unit-00000001',
      createdAt: new Date('2026-11-01T10:00:00.000Z'),
      firstResponseAt: occurredAt,
      resolvedAt: null,
    } as unknown as TicketRecord;
    const delivery = {
      id: 'outbox-00000001',
      topic: ticketSlaEffectsTopic,
      dedupeKey: 'ticket-message:message-00000001',
      payload: {
        ticketId: ticket.id,
        previousStatus: 'IN_PROGRESS',
        occurredAt: occurredAt.toISOString(),
        ...fields,
      },
      attempts: 1,
      maxAttempts: 10,
      ownerToken: 'owner-00000001',
    } as unknown as OutboxDelivery;
    const slaTimers = { apply: jest.fn().mockResolvedValue(null) };
    let pending = true;
    const outbox = {
      dispatchOne: async (topic: string, handler: OutboxHandler) => {
        if (topic !== ticketSlaEffectsTopic || !pending) return 'idle' as const;
        pending = false;
        await handler(delivery);
        return 'succeeded' as const;
      },
    };
    const prisma = {
      ticket: { findUnique: jest.fn().mockResolvedValue(ticket) },
    };
    const reconciler = new TicketSideEffectOutboxReconciler(
      prisma as never,
      outbox as never,
      {} as never,
      slaTimers as never,
      { load: async () => ({ playbooksEnabled: true, autoAttach: true }) } as never,
    );

    await reconciler.drain();

    expect(slaTimers.apply).toHaveBeenCalledTimes(1);
    expect(slaTimers.apply).toHaveBeenCalledWith(
      expect.objectContaining({
        previousStatus: 'IN_PROGRESS',
        now: occurredAt,
        event: expectedEvent,
      }),
    );
  });
});

describe('TicketSideEffectOutboxReconciler playbook auto-attach delivery', () => {
  const autoAttachMock = autoAttachPlaybook as jest.Mock;

  beforeEach(() => autoAttachMock.mockReset());

  function createHarness(options: {
    readonly status?: string;
    readonly mergedIntoTicketId?: string | null;
    readonly activeChecklist?: boolean;
    readonly playbooksEnabled?: boolean;
    readonly autoAttach?: boolean;
    readonly payload?: unknown;
  } = {}) {
    const ticket = {
      id: 'ticket-playbook-outbox-0001',
      status: options.status ?? 'PENDING',
      mergedIntoTicketId: options.mergedIntoTicketId ?? null,
      priority: 'MEDIUM',
      serviceId: 'service-playbook-outbox-0001',
      originUnitId: 'unit-playbook-outbox-0001',
      createdAt: new Date('2026-11-04T12:00:00.000Z'),
      firstResponseAt: null,
      resolvedAt: null,
    } as unknown as TicketRecord;
    const delivery = {
      id: 'outbox-playbook-0001',
      topic: ticketPlaybookAutoAttachTopic,
      dedupeKey: ticket.id,
      payload: options.payload ?? { ticketId: ticket.id },
      attempts: 1,
      maxAttempts: 10,
      ownerToken: 'owner-playbook-0001',
    } as unknown as OutboxDelivery;
    let pending = true;
    const outbox = {
      dispatchOne: async (topic: string, handler: OutboxHandler) => {
        if (topic !== ticketPlaybookAutoAttachTopic || !pending) return 'idle' as const;
        pending = false;
        await handler(delivery);
        return 'succeeded' as const;
      },
    };
    const prisma = {
      ticket: { findUnique: jest.fn().mockResolvedValue(ticket) },
      ticketPlaybook: {
        findFirst: jest.fn().mockResolvedValue(options.activeChecklist ? { id: 'active-checklist' } : null),
      },
    };
    const configuration = {
      load: jest.fn().mockResolvedValue({
        playbooksEnabled: options.playbooksEnabled ?? true,
        autoAttach: options.autoAttach ?? true,
      }),
    };
    const reconciler = new TicketSideEffectOutboxReconciler(
      prisma as never,
      outbox as never,
      {} as never,
      { apply: jest.fn() } as never,
      configuration as never,
    );
    return { ticket, prisma, configuration, reconciler };
  }

  it('processes an open-ticket intent through the auto-attach domain helper', async () => {
    autoAttachMock.mockResolvedValue(true);
    const harness = createHarness();

    await harness.reconciler.drain();

    expect(autoAttachMock).toHaveBeenCalledTimes(1);
    expect(autoAttachMock).toHaveBeenCalledWith({
      prisma: harness.prisma,
      ticket: harness.ticket,
      messages: [],
    });
  });

  it('acknowledges disabled, terminal, merged and already-attached intents without attaching', async () => {
    const disabled = createHarness({ playbooksEnabled: false });
    await disabled.reconciler.drain();
    expect(disabled.configuration.load).toHaveBeenCalledTimes(1);
    expect(autoAttachMock).not.toHaveBeenCalled();

    const closed = createHarness({ status: 'CLOSED' });
    await closed.reconciler.drain();
    expect(closed.configuration.load).not.toHaveBeenCalled();
    expect(autoAttachMock).not.toHaveBeenCalled();

    const merged = createHarness({ mergedIntoTicketId: 'merged-parent' });
    await merged.reconciler.drain();
    expect(merged.configuration.load).not.toHaveBeenCalled();
    expect(autoAttachMock).not.toHaveBeenCalled();

    const attached = createHarness({ activeChecklist: true });
    await attached.reconciler.drain();
    expect(attached.configuration.load).toHaveBeenCalledTimes(1);
    expect(autoAttachMock).not.toHaveBeenCalled();
  });

  it.each(['TICKET_PLAYBOOK_ALREADY_ATTACHED', 'TICKET_PLAYBOOK_NOT_APPLICABLE'] as const)(
    'acknowledges an attach race or a candidate that stopped being applicable (%s)',
    async (code) => {
      autoAttachMock.mockRejectedValue(new TemplatesError(code));
      const harness = createHarness();

      await expect(harness.reconciler.drain()).resolves.toBeUndefined();
      expect(autoAttachMock).toHaveBeenCalledTimes(1);
    },
  );

  it('rejects malformed auto-attach payloads for durable retry/dead-letter handling', async () => {
    const harness = createHarness({ payload: { ticketId: 123 } });

    await expect(harness.reconciler.drain()).rejects.toThrow('INVALID_TICKET_PLAYBOOK_AUTO_ATTACH_DELIVERY');
    expect(harness.configuration.load).not.toHaveBeenCalled();
    expect(autoAttachMock).not.toHaveBeenCalled();
  });
});
