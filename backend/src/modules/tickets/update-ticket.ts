import { applyTicketLifecycleTimestamps } from './apply-ticket-lifecycle-timestamps';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { changeLogActions } from '../change-log/change-log.constants';
import { assertPatchTicketStatus } from './assert-patch-ticket-status';
import { assertTicketVisible } from './authorize-ticket-actor';
import { calculateTicketPriority } from './calculate-ticket-priority';
import { loadOrganizationalUnitPath } from '../authorization/load-authorization-scope';
import { getTicket } from './get-ticket';
import { ticketSystemEventActions } from './collaboration.constants';
import type { TicketPersistedMessageSink } from './collaboration.types';
import { insertSystemTicketEvent } from './insert-system-ticket-event';
import {
  normalizeTicketDescription,
  normalizeTicketTitle,
} from './normalize-ticket-text';
import { recordTicketChange } from './record-ticket-change';
import { ticketChangeLogReasons } from './tickets.constants';
import { TicketsError } from './tickets.error';
import { toTicketFormDataInput } from './to-ticket-form-data-input';
import type {
  TicketMutationContext,
  TicketRecord,
  UpdateTicketInput,
} from './tickets.types';

export async function updateTicket(
  prisma: PrismaService,
  authorizationContextLoader: AuthorizationContextLoader,
  ticketId: string,
  input: UpdateTicketInput,
  context: TicketMutationContext,
  messages: TicketPersistedMessageSink = [],
): Promise<TicketRecord> {
  const current = await getTicket(
    prisma,
    authorizationContextLoader,
    ticketId,
    context,
  );
  const authContext = await authorizationContextLoader.loadBySubjectId(
    context.actorUserId,
  );
  if (authContext === null) {
    throw new TicketsError('FORBIDDEN');
  }
  const originUnitPath = await loadOrganizationalUnitPath(
    prisma,
    current.originUnitId,
  );
  if (originUnitPath === null) {
    throw new TicketsError('ORIGIN_UNIT_NOT_FOUND');
  }
  assertTicketVisible({
    context: authContext,
    requesterId: current.requesterId,
    originUnitId: current.originUnitId,
    originUnitPath,
    serviceId: current.serviceId,
  });
  const nextStatus = input.status ?? current.status;
  if (input.status !== undefined) {
    assertPatchTicketStatus({
      context: authContext,
      from: current.status,
      to: input.status,
    });
  }
  const impact = input.impact ?? current.impact;
  const urgency = input.urgency ?? current.urgency;
  const now = new Date();
  const timestamps = applyTicketLifecycleTimestamps({
    current,
    nextStatus,
    now,
  });
  const updated = await prisma.$transaction(async (transaction) => {
    const record = (await transaction.ticket.update({
      where: { id: ticketId },
      data: {
        title:
          input.title === undefined
            ? current.title
            : normalizeTicketTitle(input.title),
        description:
          input.description === undefined
            ? current.description
            : normalizeTicketDescription(input.description),
        impact,
        urgency,
        priority: calculateTicketPriority(impact, urgency),
        status: nextStatus,
        formData: toTicketFormDataInput(
          input.formData === undefined ? current.formData : input.formData,
        ),
        ...timestamps,
      },
    })) as TicketRecord;
    await recordTicketChange(transaction as PrismaService, {
      action: changeLogActions.update,
      reason: ticketChangeLogReasons.update,
      before: current,
      after: record,
      actorUserId: context.actorUserId,
    });
    if (
      current.status !== 'WAITING_FOR_USER' &&
      record.status === 'WAITING_FOR_USER'
    ) {
      messages.push(
        await insertSystemTicketEvent(transaction as PrismaService, {
          ticketId: record.id,
          action: ticketSystemEventActions.waitingForUserEntered,
          actorUserId: context.actorUserId,
        }),
      );
    }
    return record;
  });
  return updated;
}
