import type { TicketSlaStateRecord } from './ticket-sla.types';

export type TicketSlaStateSnapshot = {
  readonly id: string;
  readonly ticketId: string;
  readonly isResponseBreached: boolean;
  readonly isResolutionBreached: boolean;
  readonly responseDueAt: string | null;
  readonly resolutionDueAt: string | null;
  readonly pausedAt: string | null;
  readonly firedEscalationKeys: readonly string[];
};

export function toTicketSlaStateSnapshot(
  state: Pick<
    TicketSlaStateRecord,
    | 'id'
    | 'ticketId'
    | 'isResponseBreached'
    | 'isResolutionBreached'
    | 'responseDueAt'
    | 'resolutionDueAt'
    | 'pausedAt'
    | 'firedEscalationKeys'
  >,
): TicketSlaStateSnapshot {
  return {
    id: state.id,
    ticketId: state.ticketId,
    isResponseBreached: state.isResponseBreached,
    isResolutionBreached: state.isResolutionBreached,
    responseDueAt: state.responseDueAt?.toISOString() ?? null,
    resolutionDueAt: state.resolutionDueAt?.toISOString() ?? null,
    pausedAt: state.pausedAt?.toISOString() ?? null,
    firedEscalationKeys: [...state.firedEscalationKeys],
  };
}
