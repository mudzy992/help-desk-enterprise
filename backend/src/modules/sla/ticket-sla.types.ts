import type { TicketPriority, TicketStatus } from '../../generated/prisma/enums';
import type { SlaConfiguration } from './sla.types';

export type TicketSlaTimerEvent =
  | 'created'
  | 'status_changed'
  | 'agent_replied'
  | 'user_resumed'
  | 'scanned';

export type SlaClockKind = 'response' | 'resolution';

export type SlaEscalationRuleRecord = {
  readonly id: string;
  readonly slaProfileId: string;
  readonly triggerOffsetMinutes: number;
  readonly targetGroupId: string | null;
  readonly targetRole: string | null;
  readonly targetUserId: string | null;
};

export type TicketSlaTicketRef = {
  readonly id: string;
  readonly status: TicketStatus;
  readonly priority: TicketPriority;
  readonly serviceId: string;
  readonly originUnitId: string;
  readonly createdAt: Date;
  readonly firstResponseAt: Date | null;
  readonly resolvedAt: Date | null;
};

export type TicketSlaStateRecord = {
  readonly id: string;
  readonly ticketId: string;
  readonly slaProfileId: string | null;
  readonly slaRuleId: string | null;
  readonly responseMinutes: number;
  readonly resolutionMinutes: number;
  readonly startedAt: Date;
  readonly responseDueAt: Date | null;
  readonly resolutionDueAt: Date | null;
  readonly respondedAt: Date | null;
  readonly resolutionCompletedAt: Date | null;
  readonly pausedAt: Date | null;
  readonly pausedBusinessMinutes: number;
  readonly isResponseBreached: boolean;
  readonly isResolutionBreached: boolean;
  readonly firedEscalationKeys: readonly string[];
  readonly updatedAt: Date;
};

export type TicketSlaElapsedMinutes = {
  readonly responseMinutes: number;
  readonly resolutionMinutes: number;
};

export type TicketSlaTimersPort = {
  apply(input: {
    readonly ticket: TicketSlaTicketRef;
    readonly previousStatus?: TicketStatus;
    readonly now?: Date;
    readonly event: TicketSlaTimerEvent;
  }): Promise<TicketSlaStateRecord | null>;
};

export type SyncTicketSlaTimersInput = {
  readonly ticket: TicketSlaTicketRef;
  readonly previousStatus?: TicketStatus;
  readonly now?: Date;
  readonly event: TicketSlaTimerEvent;
  readonly configuration: SlaConfiguration;
};
