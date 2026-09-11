import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { changeLogActions } from '../change-log/change-log.constants';
import { assertTicketStatusTransition } from './assert-ticket-status-transition';
import {
  assertTicketVisible,
  canChangeTicketStatus,
} from './authorize-ticket-actor';
import { calculateTicketPriority } from './calculate-ticket-priority';
import { loadOrganizationalUnitPath } from '../authorization/load-authorization-scope';
import { getTicket } from './get-ticket';
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
  if (input.status !== undefined && input.status !== current.status) {
    if (!canChangeTicketStatus(authContext)) {
      throw new TicketsError('STATUS_CHANGE_FORBIDDEN');
    }
    assertTicketStatusTransition(current.status, input.status);
  }
  const impact = input.impact ?? current.impact;
  const urgency = input.urgency ?? current.urgency;
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
        status: input.status ?? current.status,
        formData: toTicketFormDataInput(
          input.formData === undefined ? current.formData : input.formData,
        ),
      },
    })) as TicketRecord;
    await recordTicketChange(transaction as PrismaService, {
      action: changeLogActions.update,
      reason: ticketChangeLogReasons.update,
      before: current,
      after: record,
      actorUserId: context.actorUserId,
    });
    return record;
  });
  return updated;
}
