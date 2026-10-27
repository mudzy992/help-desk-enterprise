import { TransactionalOutboxService } from '../../common/outbox/transactional-outbox.service';
import { persistTicketSlaRuntimeTransitions, slaRuntimeEventOutboxTopic } from './persist-ticket-sla-runtime-transitions';
import type { TicketSlaStateRecord } from './ticket-sla.types';

jest.mock('../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));

const now = new Date('2026-10-27T10:00:00.000Z');
const state: TicketSlaStateRecord = {
  id: 'state-1', ticketId: 'ticket-1', slaProfileId: 'profile-1', slaRuleId: 'rule-1',
  responseMinutes: 10, resolutionMinutes: 20, startedAt: now,
  responseDueAt: now, resolutionDueAt: now, respondedAt: null,
  resolutionCompletedAt: null, pausedAt: null, pausedBusinessMinutes: 0,
  isResponseBreached: true, isResolutionBreached: false,
  isResponseAtRisk: false, isResolutionAtRisk: false,
  firedEscalationKeys: [], nextDueAt: null, updatedAt: now,
};

describe('durable SLA runtime transitions', () => {
  afterEach(() => jest.restoreAllMocks());

  it('persists the marker and durable breach intent in the same transaction', async () => {
    const enqueue = jest.spyOn(TransactionalOutboxService.prototype, 'enqueue').mockResolvedValue({ id: 'outbox-1', created: true });
    const update = jest.fn(async () => state);
    const transaction = { ticketSlaState: { update } };
    const prisma = {
      outboxMessage: {},
      $transaction: jest.fn(async (callback: (client: unknown) => Promise<unknown>) => callback(transaction)),
    } as never;

    await expect(persistTicketSlaRuntimeTransitions(prisma, {
      ticketId: state.ticketId,
      previous: {
        isResponseBreached: false, isResolutionBreached: false,
        isResponseAtRisk: false, isResolutionAtRisk: false,
        firedEscalationKeys: [],
      },
      next: state,
      rules: [],
    })).resolves.toEqual(state);

    expect(update).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(transaction, expect.objectContaining({
      topic: slaRuntimeEventOutboxTopic,
      dedupeKey: 'state-1:ticket_sla_response_breached:none',
      payload: expect.objectContaining({ ticketId: 'ticket-1' }),
    }));
  });

  it('rejects the whole transaction when durable intent creation fails', async () => {
    jest.spyOn(TransactionalOutboxService.prototype, 'enqueue').mockRejectedValue(new Error('outbox unavailable'));
    const transaction = { ticketSlaState: { update: jest.fn(async () => state) } };
    const prisma = {
      outboxMessage: {},
      $transaction: jest.fn(async (callback: (client: unknown) => Promise<unknown>) => callback(transaction)),
    } as never;

    await expect(persistTicketSlaRuntimeTransitions(prisma, {
      ticketId: state.ticketId,
      previous: {
        isResponseBreached: false, isResolutionBreached: false,
        isResponseAtRisk: false, isResolutionAtRisk: false,
        firedEscalationKeys: [],
      },
      next: state,
      rules: [],
    })).rejects.toThrow('outbox unavailable');
  });
});
