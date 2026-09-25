import { PrismaService } from '../../../common/prisma/prisma.service';
import type { EmailChannelConfiguration } from './load-email-channel-configuration';
import type { MailTransport } from './mail-transport';
import {
  claimNotificationEmailDelivery,
  markNotificationEmailDeliverySent,
  releaseNotificationEmailDeliveryClaim,
} from './persist-notification-email-delivery';

export type PreparedOutboundEmail = {
  readonly userId: string;
  readonly toAddress: string;
  readonly subject: string;
  readonly text: string;
  readonly templateKey: string;
  readonly dedupeKey: string;
  readonly html?: string;
  readonly replyTo?: string;
  readonly messageId?: string;
  readonly headers?: Readonly<Record<string, string>>;
};

export async function deliverNotificationEmail(
  prisma: PrismaService,
  mailTransport: MailTransport,
  configuration: EmailChannelConfiguration,
  input: PreparedOutboundEmail,
): Promise<void> {
  const smtp = configuration.smtp;
  if (smtp === null) {
    throw new Error('SMTP transport is not configured');
  }
  const claimed = await claimNotificationEmailDelivery(prisma, {
    userId: input.userId,
    dedupeKey: input.dedupeKey,
    toAddress: input.toAddress,
    templateKey: input.templateKey,
  });
  if (!claimed) {
    return;
  }
  try {
    await mailTransport.send(
      {
        from: smtp.fromAddress,
        to: input.toAddress,
        subject: input.subject,
        text: input.text,
        ...(input.html === undefined ? {} : { html: input.html }),
        ...(input.replyTo === undefined ? {} : { replyTo: input.replyTo }),
        ...(input.messageId === undefined ? {} : { messageId: input.messageId }),
        ...(input.headers === undefined ? {} : { headers: input.headers }),
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
