import { daysToMilliseconds } from '../apply-ticket-lifecycle-timestamps';
import type { TicketRecord, TicketReopenDescriptor } from '../tickets.types';
import { reopenableTicketStatuses } from './reopen.constants';
import type {
  ResolvedTicketReopenPolicy,
  TicketReopenConfiguration,
} from './reopen.types';

export const inactiveTicketReopenDescriptor: TicketReopenDescriptor = {
  enabled: false,
  eligible: false,
  createsNewTicket: false,
  windowEndsAt: null,
};

export function resolveTicketReopenPolicy(input: {
  readonly ticket: TicketRecord;
  readonly configuration: TicketReopenConfiguration;
  readonly now: Date;
}): ResolvedTicketReopenPolicy {
  const windowEndsAt = resolveReopenWindowEnd(input.ticket, input.configuration);
  const eligibleStatus = isReopenableStatus(input.ticket.status);
  if (!input.configuration.enabled || !eligibleStatus || windowEndsAt === null) {
    return {
      ...inactiveTicketReopenDescriptor,
      enabled: input.configuration.enabled,
      eligible: false,
      mode: null,
    };
  }
  const createsNewTicket = input.now.getTime() > windowEndsAt.getTime();
  return {
    enabled: true,
    eligible: true,
    createsNewTicket,
    windowEndsAt: windowEndsAt.toISOString(),
    mode: createsNewTicket ? 'new_ticket' : 'same_ticket',
  };
}

export function describeTicketReopen(
  ticket: TicketRecord,
  configuration: TicketReopenConfiguration,
  now: Date,
): TicketReopenDescriptor {
  const policy = resolveTicketReopenPolicy({ ticket, configuration, now });
  return {
    enabled: policy.enabled,
    eligible: policy.eligible,
    createsNewTicket: policy.createsNewTicket,
    windowEndsAt: policy.windowEndsAt,
  };
}

export function resolveReopenWindowEnd(
  ticket: TicketRecord,
  configuration: TicketReopenConfiguration,
): Date | null {
  const origin = ticket.resolvedAt ?? ticket.closedAt;
  if (origin === null) {
    return null;
  }
  return new Date(origin.getTime() + daysToMilliseconds(configuration.windowDays));
}

export function isReopenableStatus(
  status: TicketRecord['status'],
): status is (typeof reopenableTicketStatuses)[number] {
  return (reopenableTicketStatuses as readonly string[]).includes(status);
}
