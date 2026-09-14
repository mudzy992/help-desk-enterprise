import { PrismaService } from '../../common/prisma/prisma.service';
import { recordAuditEntry } from '../audit-log/record-audit-entry';
import {
  auditLogActions,
  auditLogEntityTypes,
} from '../audit-log/audit-log.constants';
import type { AuthorizationPrincipal } from '../authentication/authentication.types';
import { ticketSystemEventActions } from '../tickets/collaboration.constants';
import { insertSystemTicketEvent } from '../tickets/insert-system-ticket-event';
import { findLatestRemoteRequestAt } from '../tickets/remote/find-latest-remote-request-at';
import { EdgeExtensionError } from './edge-extension.error';
import type { EdgeExtensionConfiguration } from './edge-extension.types';

export type EdgeRemoteAcknowledgeResponse = {
  readonly accepted: boolean;
  readonly duplicate: boolean;
  readonly ticketId: string;
};

export async function acknowledgeEdgeRemoteRequest(
  prisma: PrismaService,
  principal: AuthorizationPrincipal,
  ticketId: string,
  configuration: EdgeExtensionConfiguration,
): Promise<EdgeRemoteAcknowledgeResponse> {
  if (!configuration.remoteEnabled) {
    throw new EdgeExtensionError('REMOTE_DISABLED');
  }
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { id: true, requesterId: true },
  });
  if (ticket === null) {
    throw new EdgeExtensionError('NOT_FOUND');
  }
  if (ticket.requesterId !== principal.subjectId) {
    const participant = await prisma.ticketParticipant.findFirst({
      where: { ticketId: ticket.id, userId: principal.subjectId },
      select: { id: true },
    });
    if (participant === null) {
      throw new EdgeExtensionError('FORBIDDEN');
    }
  }
  const requestedAt = await findLatestRemoteRequestAt(prisma, ticket.id);
  if (requestedAt === null) {
    throw new EdgeExtensionError('REMOTE_NOT_REQUESTED');
  }
  const existing = await prisma.auditLog.findFirst({
    where: {
      action: auditLogActions.ticketRemoteAcknowledged,
      entityType: auditLogEntityTypes.ticket,
      entityId: ticket.id,
      actorUserId: principal.subjectId,
    },
    select: { id: true },
  });
  if (existing !== null) {
    return { accepted: true, duplicate: true, ticketId: ticket.id };
  }
  await insertSystemTicketEvent(prisma, {
    ticketId: ticket.id,
    action: ticketSystemEventActions.remoteAcknowledged,
    actorUserId: principal.subjectId,
  });
  if (configuration.auditAcknowledge) {
    await recordAuditEntry(prisma, {
      action: auditLogActions.ticketRemoteAcknowledged,
      entityType: auditLogEntityTypes.ticket,
      entityId: ticket.id,
      actorUserId: principal.subjectId,
      metadata: { event: ticketSystemEventActions.remoteRequested },
    });
  }
  return { accepted: true, duplicate: false, ticketId: ticket.id };
}
