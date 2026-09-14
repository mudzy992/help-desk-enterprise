import { PrismaService } from '../../../common/prisma/prisma.service';
import type { TicketRealtimeMessagePayload } from '../../tickets/collaboration.types';
import { buildNotificationContent } from '../fan-out/build-notification-content';
import { mapTicketEventToNotification } from '../fan-out/map-ticket-event-to-notification';
import { resolveNotificationRecipients } from '../fan-out/resolve-notification-recipients';
import type { EmailChannelConfiguration } from './load-email-channel-configuration';
import { isAllowedNotificationEmailAddress } from './is-allowed-notification-email-address';
import type { MailTransport } from './mail-transport';
import {
  deliverNotificationEmail,
  type PreparedOutboundEmail,
} from './deliver-notification-email';
import { renderEmailTemplate } from './render-email-template';
import type { EmailTemplateKey } from './email-template.constants';
import { emailTemplateKeys } from './email-template.constants';

export type OutboundEmailWorkHandler = {
  handle(work: PreparedOutboundEmail): Promise<void>;
};

export async function fanOutEmailNotifications(
  prisma: PrismaService,
  configuration: EmailChannelConfiguration,
  mailTransport: MailTransport,
  payload: TicketRealtimeMessagePayload,
  workHandler?: OutboundEmailWorkHandler,
): Promise<void> {
  if (!configuration.deliveryEnabled || configuration.smtp === null) {
    return;
  }
  const mapped = mapTicketEventToNotification(payload);
  if (mapped === null || !isEmailTemplateKey(mapped.type)) {
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
  });
  const content = buildNotificationContent(
    mapped,
    ticket,
    payload.id,
    payload.authorUserId,
  );
  const rendered = renderEmailTemplate(configuration.templates[mapped.type], {
    ticketNumber: ticket.ticketNumber,
    ticketTitle: ticket.isConfidential ? ticket.ticketNumber : ticket.title,
    ticketId: ticket.id,
    type: content.type,
    event: mapped.event,
  });
  const handler = workHandler ?? {
    handle: (work) =>
      deliverNotificationEmail(prisma, mailTransport, configuration, work),
  };
  const dedupeKey = `${mapped.type}:${payload.id}`;
  for (const userId of recipientIds) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    const toAddress = user?.email ?? '';
    if (
      !isAllowedNotificationEmailAddress(toAddress, {
        internalOnly: configuration.internalOnly,
        allowedExternalDomains: configuration.allowedExternalDomains,
        allowedExternalEmails: configuration.allowedExternalEmails,
      })
    ) {
      continue;
    }
    await handler.handle({
      userId,
      toAddress,
      dedupeKey,
      templateKey: mapped.type,
      subject: rendered.subject,
      text: rendered.text,
    });
  }
}

function isEmailTemplateKey(value: string): value is EmailTemplateKey {
  return emailTemplateKeys.some((key) => key === value);
}
