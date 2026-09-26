import { PrismaService } from '../../../common/prisma/prisma.service';
import { ticketSystemEventActions } from '../../tickets/collaboration.constants';
import type { TicketRealtimeMessagePayload } from '../../tickets/collaboration.types';
import { notificationTypes } from '../notifications.constants';
import { mapTicketEventToNotification } from '../fan-out/map-ticket-event-to-notification';
import { resolveNotificationRecipients } from '../fan-out/resolve-notification-recipients';
import type { EmailChannelConfiguration } from './load-email-channel-configuration';
import { isAllowedNotificationEmailAddress } from './is-allowed-notification-email-address';
import type { MailTransport } from './mail-transport';
import {
  deliverNotificationEmail,
  type PreparedOutboundEmail,
} from './deliver-notification-email';
import { composeTicketEmail, redactForEmail, resolveEmailLocale } from './compose-ticket-email';
import type { EmailTemplateKey } from './email-template.constants';
import { emailTemplateKeys } from './email-template.constants';
import type { NotificationPreferencePolicy } from '../preferences/notification-preference-policy';
import { resolveDeliveryDecisions } from '../preferences/resolve-delivery-decisions';
import { holdForDigest, type HeldDigestItem } from '../preferences/hold-for-digest';

const slaEscalationEvents = new Set<string>([
  ticketSystemEventActions.slaResponseEscalated,
  ticketSystemEventActions.slaResolutionEscalated,
]);

export type OutboundEmailWorkHandler = {
  handle(work: PreparedOutboundEmail): Promise<void>;
};

export async function fanOutEmailNotifications(
  prisma: PrismaService,
  configuration: EmailChannelConfiguration,
  mailTransport: MailTransport,
  payload: TicketRealtimeMessagePayload,
  workHandler?: OutboundEmailWorkHandler,
  /** Paket 2.2: personal preferences; absent = everyone immediately (as before). */
  policy?: NotificationPreferencePolicy,
): Promise<void> {
  if (!configuration.deliveryEnabled || configuration.smtp === null) {
    return;
  }
  const mapped = mapTicketEventToNotification(payload);
  if (mapped === null || !isEmailTemplateKey(mapped.type)) {
    return;
  }
  if (!isSlaEmailAllowed(mapped.type, mapped.event, configuration)) {
    return;
  }
  const ticket = await prisma.ticket.findUnique({
    where: { id: payload.ticketId },
  });
  if (ticket === null) {
    return;
  }
  const recipientIds = await resolveNotificationRecipients(prisma, {
    type: mapped.type,
    ticket,
    actorUserId: payload.authorUserId,
    event: mapped.event,
    messageBody: payload.body,
  });
  if (recipientIds.length === 0) {
    return;
  }
  // One query for all recipients (+ the actor) instead of one per recipient.
  const people = await prisma.user.findMany({
    where: {
      id: {
        in: [
          ...new Set([
            ...recipientIds,
            ...(payload.authorUserId === null ? [] : [payload.authorUserId]),
          ]),
        ],
      },
    },
    select: { id: true, email: true, displayName: true, preferredLocale: true },
  });
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const [service, group] = await Promise.all([
    prisma.service.findUnique({ where: { id: ticket.serviceId }, select: { name: true } }),
    ticket.assignedGroupId === null
      ? Promise.resolve(null)
      : prisma.group.findUnique({ where: { id: ticket.assignedGroupId }, select: { name: true } }),
  ]);
  const actorName =
    payload.authorUserId === null ? '' : (peopleById.get(payload.authorUserId)?.displayName ?? '');
  const excerpt = publicExcerpt(payload);
  const handler = workHandler ?? {
    handle: (work) =>
      deliverNotificationEmail(prisma, mailTransport, configuration, work),
  };
  const dedupeKey = `${mapped.type}:${payload.id}`;
  const decisions =
    policy === undefined
      ? null
      : await resolveDeliveryDecisions(prisma, policy, { type: mapped.type, userIds: recipientIds });
  const held: HeldDigestItem[] = [];
  for (const userId of recipientIds) {
    const person = peopleById.get(userId);
    const toAddress = person?.email ?? '';
    if (
      person === undefined ||
      !isAllowedNotificationEmailAddress(toAddress, {
        internalOnly: configuration.internalOnly,
        allowedExternalDomains: configuration.allowedExternalDomains,
        allowedExternalEmails: configuration.allowedExternalEmails,
      })
    ) {
      continue;
    }
    const decision = decisions?.get(userId)?.email ?? 'IMMEDIATE';
    if (decision === 'OFF') {
      continue;
    }
    if (decision === 'DIGEST' || decision === 'QUIET') {
      held.push({
        userId,
        type: mapped.type,
        reason: decision,
        ticketId: ticket.id,
        event: mapped.event,
        dedupeKey,
      });
      continue;
    }
    const composed = composeTicketEmail({
      configuration,
      key: mapped.type,
      locale: resolveEmailLocale(person.preferredLocale, configuration),
      ticket,
      serviceName: service?.name ?? '',
      groupName: group?.name ?? '',
      recipientName: person.displayName,
      actorName,
      event: mapped.event,
      excerpt,
      dedupeKey,
      recipientId: userId,
    });
    await handler.handle({
      userId,
      toAddress,
      dedupeKey,
      templateKey: mapped.type,
      subject: composed.subject,
      text: composed.text,
      html: composed.html,
      messageId: composed.messageId,
      headers: composed.headers,
      ...(composed.replyTo === undefined ? {} : { replyTo: composed.replyTo }),
    });
  }
  await holdForDigest(prisma, held);
}

/**
 * Decision E4: only public replies, passed through the default redaction
 * patterns regardless of the in-app redaction mode (e-mail leaves the system).
 */
function publicExcerpt(payload: TicketRealtimeMessagePayload): string | null {
  if (payload.type !== 'USER_REPLY' && payload.type !== 'AGENT_REPLY') {
    return null;
  }
  const text = redactForEmail(payload.body);
  return text.length === 0 ? null : text;
}

function isSlaEmailAllowed(
  type: string,
  event: string,
  configuration: EmailChannelConfiguration,
): boolean {
  if (type !== notificationTypes.ticketSla) {
    return true;
  }
  if (!slaEscalationEvents.has(event)) {
    return false;
  }
  return configuration.slaEscalationEmailEnabled;
}

function isEmailTemplateKey(value: string): value is EmailTemplateKey {
  return emailTemplateKeys.some((key) => key === value);
}
