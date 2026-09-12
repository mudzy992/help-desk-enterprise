import { PrismaService } from '../../../common/prisma/prisma.service';
import { changeLogActions } from '../../change-log/change-log.constants';
import { applyTicketLifecycleTimestamps } from '../apply-ticket-lifecycle-timestamps';
import { ticketSystemEventActions } from '../collaboration.constants';
import type { TicketPersistedMessageSink } from '../collaboration.types';
import { insertSystemTicketEvent } from '../insert-system-ticket-event';
import { recordTicketChange } from '../record-ticket-change';
import { ticketChangeLogReasons } from '../tickets.constants';
import type { TicketRecord } from '../tickets.types';
import { applyTicketSlaTimers } from '../apply-ticket-sla-timers';
import type { TicketSlaTimersPort } from '../../sla/ticket-sla.types';
import { evaluateWaitingForUserAction } from './evaluate-waiting-for-user-action';
import { claimWaitingForUserAutomation } from './claim-waiting-for-user-automation';
import type { WaitingForUserConfiguration } from './waiting-for-user.types';
import type { TicketGuardrailsConfiguration } from '../guardrails/guardrails.types';

export async function processWaitingForUserTicket(input: {
  readonly prisma: PrismaService;
  readonly ticket: TicketRecord;
  readonly configuration: WaitingForUserConfiguration;
  readonly guardrails: TicketGuardrailsConfiguration;
  readonly now: Date;
  readonly messages?: TicketPersistedMessageSink;
  readonly slaTimers?: TicketSlaTimersPort;
}): Promise<TicketRecord> {
  const action = evaluateWaitingForUserAction({
    configuration: input.configuration,
    enteredAt: input.ticket.waitingForUserEnteredAt,
    reminderSentAt: input.ticket.waitingForUserReminderSentAt,
    now: input.now,
  });
  if (action === 'none' || input.ticket.status !== 'WAITING_FOR_USER') {
    return input.ticket;
  }
  const allowed = await claimWaitingForUserAutomation({
    prisma: input.prisma,
    ticket: input.ticket,
    action,
    guardrails: input.guardrails,
    now: input.now,
    messages: input.messages,
  });
  if (!allowed) {
    return input.ticket;
  }
  if (action === 'remind') {
    return remindWaitingForUserTicket(input);
  }
  return autoCloseWaitingForUserTicket(input);
}

async function remindWaitingForUserTicket(input: {
  readonly prisma: PrismaService;
  readonly ticket: TicketRecord;
  readonly now: Date;
  readonly messages?: TicketPersistedMessageSink;
}): Promise<TicketRecord> {
  const updated = (await input.prisma.ticket.update({
    where: { id: input.ticket.id },
    data: { waitingForUserReminderSentAt: input.now },
  })) as TicketRecord;
  await recordTicketChange(input.prisma, {
    action: changeLogActions.update,
    reason: ticketChangeLogReasons.waitingReminder,
    before: input.ticket,
    after: updated,
    actorUserId: null,
  });
  input.messages?.push(
    await insertSystemTicketEvent(input.prisma, {
      ticketId: updated.id,
      action: ticketSystemEventActions.waitingForUserReminder,
      actorUserId: null,
    }),
  );
  return updated;
}

async function autoCloseWaitingForUserTicket(input: {
  readonly prisma: PrismaService;
  readonly ticket: TicketRecord;
  readonly now: Date;
  readonly messages?: TicketPersistedMessageSink;
  readonly slaTimers?: TicketSlaTimersPort;
}): Promise<TicketRecord> {
  const timestamps = applyTicketLifecycleTimestamps({
    current: input.ticket,
    nextStatus: 'CLOSED',
    now: input.now,
  });
  const updated = (await input.prisma.ticket.update({
    where: { id: input.ticket.id },
    data: {
      status: 'CLOSED',
      ...timestamps,
    },
  })) as TicketRecord;
  await recordTicketChange(input.prisma, {
    action: changeLogActions.update,
    reason: ticketChangeLogReasons.waitingAutoClose,
    before: input.ticket,
    after: updated,
    actorUserId: null,
  });
  input.messages?.push(
    await insertSystemTicketEvent(input.prisma, {
      ticketId: updated.id,
      action: ticketSystemEventActions.waitingForUserAutoClosed,
      actorUserId: null,
    }),
  );
  await applyTicketSlaTimers(
    { actorUserId: 'system', slaTimers: input.slaTimers },
    {
      ticket: updated,
      previousStatus: input.ticket.status,
      now: input.now,
      event: 'status_changed',
    },
  );
  return updated;
}
