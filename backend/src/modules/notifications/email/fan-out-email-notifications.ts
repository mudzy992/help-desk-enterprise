import { PrismaService } from '../../../common/prisma/prisma.service';
import type { TicketRealtimeMessagePayload } from '../../tickets/collaboration.types';
import { buildNotificationContent } from '../fan-out/build-notification-content';
import { mapTicketEventToNotification } from '../fan-out/map-ticket-event-to-notification';
import { resolveNotificationRecipients } from '../fan-out/resolve-notification-recipients';
import type { EmailChannelConfiguration } from './load-email-channel-configuration';
import { isAllowedNotificationEmailAddress } from './is-allowed-notification-email-address';
import type { MailTransport } from './mail-transport';
import {
  claimNotificationEmailDelivery,
  markNotificationEmailDeliverySent,
  releaseNotificationEmailDeliveryClaim,
} from './persist-notification-email-delivery';
import { renderEmailTemplate } from './render-email-template';
import type { EmailTemplateKey } from './email-template.constants';
import { emailTemplateKeys } from './email-template.constants';

export async function fanOutEmailNotifications(
  prisma: PrismaService,
  configuration: EmailChannelConfiguration,
  mailTransport: MailTransport,
  payload: TicketRealtimeMessagePayload,
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
  const dedupeKey = `${mapped.type}:${payload.id}`;
  for (const userId of recipientIds) {
    await deliverToRecipient(prisma, mailTransport, configuration, {
      userId,
      dedupeKey,
      templateKey: mapped.type,
      subject: rendered.subject,
      text: rendered.text,
    });
  }
}

async function deliverToRecipient(
  prisma: PrismaService,
  mailTransport: MailTransport,
  configuration: EmailChannelConfiguration,
  input: {
    readonly userId: string;
    readonly dedupeKey: string;
    readonly templateKey: EmailTemplateKey;
    readonly subject: string;
    readonly text: string;
  },
): Promise<void> {
  const smtp = configuration.smtp;
  if (smtp === null) {
    return;
  }
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
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
    return;
  }
  const claimed = await claimNotificationEmailDelivery(prisma, {
    userId: input.userId,
    dedupeKey: input.dedupeKey,
    toAddress,
    templateKey: input.templateKey,
  });
  if (!claimed) {
    return;
  }
  try {
    await mailTransport.send(
      {
        from: smtp.fromAddress,
        to: toAddress,
        subject: input.subject,
        text: input.text,
      },
      smtp,
    );
    await markNotificationEmailDeliverySent(prisma, {
      userId: input.userId,
      dedupeKey: input.dedupeKey,
    });
  } catch (error) {
    await releaseNotificationEmailDeliveryClaim(prisma, {
      userId: input.userId,
      dedupeKey: input.dedupeKey,
    });
    throw error;
  }
}

function isEmailTemplateKey(value: string): value is EmailTemplateKey {
  return emailTemplateKeys.some((key) => key === value);
}
