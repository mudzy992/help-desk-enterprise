import { Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { EmailChannelConfiguration } from './load-email-channel-configuration';
import type { MailTransport, OutboundMailAttachment } from './mail-transport';
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
  readonly attachments?: readonly OutboundMailAttachment[];
};

const logger = new Logger('NotificationEmailDelivery');

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
  const messageId = stableNotificationEmailMessageId(input, smtp.fromAddress);
  const claim = await claimNotificationEmailDelivery(prisma, {
    userId: input.userId,
    dedupeKey: input.dedupeKey,
    toAddress: input.toAddress,
    templateKey: input.templateKey,
  });
  if (claim === 'DUPLICATE') {
    return;
  }
  if (claim === 'UNKNOWN') {
    // Do not log recipient, subject, user ID, or raw dedupe key. The opaque
    // fingerprint correlates retries without copying notification content to logs.
    logger.warn(
      `notification_email_delivery_unknown fingerprint=${deliveryFingerprint(input)} template=${input.templateKey}`,
    );
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
        messageId,
        ...(input.headers === undefined ? {} : { headers: input.headers }),
        ...(input.attachments === undefined ? {} : { attachments: input.attachments }),
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

/**
 * Callers that compose templates already provide a stable Message-ID. This
 * deterministic fallback also covers simpler system notices that do not use a
 * template composer; it is a correlation aid, not an SMTP/provider deduplication
 * guarantee.
 */
export function stableNotificationEmailMessageId(
  input: Pick<PreparedOutboundEmail, 'userId' | 'dedupeKey' | 'messageId'>,
  fromAddress: string,
): string {
  if (input.messageId !== undefined) {
    return input.messageId;
  }
  const digest = createHash('sha256')
    .update(input.userId)
    .update('\0')
    .update(input.dedupeKey)
    .digest('hex')
    .slice(0, 32);
  const candidateDomain = fromAddress.trim().match(/@([a-z0-9.-]+)>?$/iu)?.[1]?.toLowerCase();
  const domain =
    candidateDomain !== undefined && /^[a-z0-9.-]+$/iu.test(candidateDomain)
      ? candidateDomain
      : 'service-desk.invalid';
  return `<${digest}@${domain}>`;
}

function deliveryFingerprint(input: Pick<PreparedOutboundEmail, 'userId' | 'dedupeKey'>): string {
  return createHash('sha256')
    .update(input.userId)
    .update('\0')
    .update(input.dedupeKey)
    .digest('hex')
    .slice(0, 16);
}
