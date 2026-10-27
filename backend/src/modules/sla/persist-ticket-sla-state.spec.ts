import { persistTicketSlaState } from './persist-ticket-sla-state';

const state = (startedAt = new Date('2026-01-01T00:00:00.000Z')) => ({
  ticketId: 'ticket-1', slaProfileId: null, slaRuleId: null,
  responseMinutes: 60, resolutionMinutes: 120, startedAt,
  responseDueAt: null, resolutionDueAt: null, respondedAt: null,
  resolutionCompletedAt: null, pausedAt: null, pausedBusinessMinutes: 0,
  isResponseBreached: false, isResolutionBreached: false,
  isResponseAtRisk: false, isResolutionAtRisk: false,
  firedEscalationKeys: [], nextDueAt: null,
});

describe('persistTicketSlaState first creation', () => {
  it('uses an empty-update upsert so the loser cannot overwrite the winner', async () => {
    const winner = { ...state(), id: 'winner', updatedAt: new Date() };
    const upsert = jest.fn().mockResolvedValue(winner);
    const result = await persistTicketSlaState({ ticketSlaState: { upsert } } as never, state());
    expect(result).toBe(winner);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { ticketId: 'ticket-1' }, update: {},
    }));
  });

  it('reloads the winner after a P2002 in a legacy adapter', async () => {
    const winner = { ...state(), id: 'winner', updatedAt: new Date() };
    const delegate = {
      create: jest.fn().mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' })),
      findUnique: jest.fn().mockResolvedValue(winner),
    };
    await expect(persistTicketSlaState({ ticketSlaState: delegate } as never, state())).resolves.toBe(winner);
    expect(delegate.findUnique).toHaveBeenCalledWith({ where: { ticketId: 'ticket-1' } });
  });

  it('does not hide a non-unique create failure', async () => {
    const failure = new Error('database unavailable');
    const delegate = { create: jest.fn().mockRejectedValue(failure), findUnique: jest.fn() };
    await expect(persistTicketSlaState({ ticketSlaState: delegate } as never, state())).rejects.toBe(failure);
    expect(delegate.findUnique).not.toHaveBeenCalled();
  });
});
