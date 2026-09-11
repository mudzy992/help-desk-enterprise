import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { changeLogActions } from '../../change-log/change-log.constants';
import { loadOrganizationalUnitPath } from '../../authorization/load-authorization-scope';
import { assertTicketStatusTransition } from '../assert-ticket-status-transition';
import { insertSystemTicketEvent } from '../insert-system-ticket-event';
import { applyTicketLifecycleTimestamps } from '../apply-ticket-lifecycle-timestamps';
import { loadAccessibleTicket } from '../load-accessible-ticket';
import { recordTicketChange } from '../record-ticket-change';
import { ticketSystemEventActions } from '../collaboration.constants';
import type { TicketPersistedMessageSink } from '../collaboration.types';
import type { TicketMutationContext, TicketRecord } from '../tickets.types';
import { TicketsError } from '../tickets.error';
import { assertCanDecideTicketApproval } from './assert-can-decide-ticket-approval';
import {
  ticketApprovalChangeLogReasons,
} from './approvals.constants';
import type {
  TicketApprovalDecision,
  TicketApprovalRecord,
  TicketApprovalsConfiguration,
} from './approvals.types';
import { normalizeApprovalComment } from './normalize-approval-comment';

export async function decideTicketApproval(
  prisma: PrismaService,
  authorizationContextLoader: AuthorizationContextLoader,
  configuration: TicketApprovalsConfiguration,
  ticketId: string,
  approvalId: string,
  decision: TicketApprovalDecision,
  comment: string,
  context: TicketMutationContext,
  messages: TicketPersistedMessageSink = [],
): Promise<TicketRecord> {
  const { ticket } = await loadAccessibleTicket(
    prisma,
    authorizationContextLoader,
    ticketId,
    context,
    { writable: true },
  );
  const authContext = await authorizationContextLoader.loadBySubjectId(
    context.actorUserId,
  );
  if (authContext === null) {
    throw new TicketsError('FORBIDDEN');
  }
  const originUnitPath = await loadOrganizationalUnitPath(
    prisma,
    ticket.originUnitId,
  );
  if (originUnitPath === null) {
    throw new TicketsError('ORIGIN_UNIT_NOT_FOUND');
  }
  const approval = (await prisma.ticketApproval.findUnique({
    where: { id: approvalId },
  })) as TicketApprovalRecord | null;
  if (approval === null || approval.ticketId !== ticket.id) {
    throw new TicketsError('APPROVAL_NOT_FOUND');
  }
  assertCanDecideTicketApproval({
    context: authContext,
    ticket,
    approval,
    originUnitPath,
    configuration,
  });
    const nextStatus = decision === 'APPROVED' ? 'PENDING' : 'CLOSED';
  assertTicketStatusTransition(ticket.status, nextStatus);
  const normalizedComment = normalizeApprovalComment(comment);
  const decidedAt = new Date();
  const timestamps = applyTicketLifecycleTimestamps({
    current: ticket,
    nextStatus,
    now: decidedAt,
  });
  return prisma.$transaction(async (transaction) => {
    await transaction.ticketApproval.update({
      where: { id: approval.id },
      data: {
        status: decision,
        approverUserId: context.actorUserId,
        comment: normalizedComment,
        decidedAt,
      },
    });
    const updated = (await transaction.ticket.update({
      where: { id: ticket.id },
      data: { status: nextStatus, ...timestamps },
    })) as TicketRecord;
    await recordTicketChange(transaction as PrismaService, {
      action: changeLogActions.update,
      reason:
        decision === 'APPROVED'
          ? ticketApprovalChangeLogReasons.approved
          : ticketApprovalChangeLogReasons.rejected,
      before: ticket,
      after: updated,
      actorUserId: context.actorUserId,
    });
    await ensureApproverParticipant(
      transaction as PrismaService,
      updated.id,
      context.actorUserId,
    );
    messages.push(
      await insertSystemTicketEvent(transaction as PrismaService, {
        ticketId: updated.id,
        action:
          decision === 'APPROVED'
            ? ticketSystemEventActions.approvalApproved
            : ticketSystemEventActions.approvalRejected,
        actorUserId: context.actorUserId,
      }),
    );
    messages.push(
      await transaction.ticketMessage.create({
        data: {
          ticketId: updated.id,
          type: 'APPROVAL_DECISION',
          body: normalizedComment,
          authorUserId: context.actorUserId,
        },
      }),
    );
    return updated;
  });
}

async function ensureApproverParticipant(
  prisma: PrismaService,
  ticketId: string,
  userId: string,
): Promise<void> {
  const existing = await prisma.ticketParticipant.findFirst({
    where: { ticketId, role: 'APPROVER', userId },
    select: { id: true },
  });
  if (existing !== null) {
    return;
  }
  await prisma.ticketParticipant.create({
    data: { ticketId, role: 'APPROVER', userId },
  });
}
