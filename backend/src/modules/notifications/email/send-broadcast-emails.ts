import { PrismaService } from '../../../common/prisma/prisma.service';
import type { BroadcastEmailRequest } from '../../tickets/bulk/broadcast-email-channel';
import { composeTicketEmail, resolveEmailLocale } from './compose-ticket-email';
import type { PreparedOutboundEmail } from './deliver-notification-email';
import { isAllowedNotificationEmailAddress } from './is-allowed-notification-email-address';
import type { EmailChannelConfiguration } from './load-email-channel-configuration';

/**
 * Broadcast e-mail (key `ticket.broadcast`) to the requester and the assignee
 * — the same people the bulk preview counts — minus the sender.
 */
export async function sendBroadcastEmails(
  prisma: PrismaService,
  configuration: EmailChannelConfiguration,
  request: BroadcastEmailRequest,
  handler: { handle(work: PreparedOutboundEmail): Promise<void> },
): Promise<number> {
  if (!configuration.deliveryEnabled || configuration.smtp === null) {
    return 0;
  }
  const ticket = await prisma.ticket.findUnique({ where: { id: request.ticketId } });
  if (ticket === null) {
    return 0;
  }
  const recipientIds = [ticket.requesterId, ticket.assignedUserId].filter(
    (id): id is string => typeof id === 'string' && id.length > 0 && id !== request.actorUserId,
  );
  if (recipientIds.length === 0) {
    return 0;
  }
  const people = await prisma.user.findMany({
    where: {
      id: {
        in: [
          ...new Set([
            ...recipientIds,
            ...(request.actorUserId === null ? [] : [request.actorUserId]),
          ]),
        ],
      },
    },
    select: { id: true, email: true, displayName: true, preferredLocale: true },
  });
  const byId = new Map(people.map((person) => [person.id, person]));
  const [service, group] = await Promise.all([
    prisma.service.findUnique({ where: { id: ticket.serviceId }, select: { name: true } }),
    ticket.assignedGroupId === null
      ? Promise.resolve(null)
      : prisma.group.findUnique({ where: { id: ticket.assignedGroupId }, select: { name: true } }),
  ]);
  const dedupeKey = `ticket.broadcast:${request.batchId ?? 'single'}:${ticket.id}`;
  let sent = 0;
  for (const userId of new Set(recipientIds)) {
    const person = byId.get(userId);
    if (
      person === undefined ||
      !isAllowedNotificationEmailAddress(person.email, {
        internalOnly: configuration.internalOnly,
        allowedExternalDomains: configuration.allowedExternalDomains,
        allowedExternalEmails: configuration.allowedExternalEmails,
      })
    ) {
      continue;
    }
    const composed = composeTicketEmail({
      configuration,
      key: 'ticket.broadcast',
      locale: resolveEmailLocale(person.preferredLocale, configuration),
      ticket,
      serviceName: service?.name ?? '',
      groupName: group?.name ?? '',
      recipientName: person.displayName,
      actorName:
        request.actorUserId === null ? '' : (byId.get(request.actorUserId)?.displayName ?? ''),
      event: 'ticket_bulk_broadcast',
      // The broadcast text is the whole point of the e-mail; it is always shown
      // (except on confidential tickets, which the renderer enforces).
      excerpt: request.body,
      dedupeKey,
      recipientId: userId,
    });
    await handler.handle({
      userId,
      toAddress: person.email,
      dedupeKey,
      templateKey: 'ticket.broadcast',
      subject: composed.subject,
      text: composed.text,
      html: composed.html,
      messageId: composed.messageId,
      headers: composed.headers,
      ...(composed.replyTo === undefined ? {} : { replyTo: composed.replyTo }),
    });
    sent += 1;
  }
  return sent;
}
