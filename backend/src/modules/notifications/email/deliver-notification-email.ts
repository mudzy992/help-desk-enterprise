import { Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  classifyMailSendError,
  isAmbiguousMailSendError,
  isPermanentRecipientFailure,
} from './classify-mail-send-error';
import type { MailSendFailureKind } from './classify-mail-send-error';
import {
  NotificationEmailDeliveryDeadError,
  NotificationEmailOutcomeUnknownError,
  NotificationEmailRetryNotDueError,
} from './notification-email-delivery-errors';
import type { EmailChannelConfiguration } from './load-email-channel-configuration';
import type { MailTransport, MailTransportResult, OutboundMailAttachment } from './mail-transport';
import {
  claimNotificationEmailDelivery,
  markNotificationEmailDeliveryFailed,
  markNotificationEmailDeliverySent,
  markNotificationEmailDeliveryUnknown,
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
  if (claim === 'DUPLICATE') return;
  if (claim === 'UNKNOWN') {
    logger.warn(
      `notification_email_delivery_unknown fingerprint=${deliveryFingerprint(input)} template=${input.templateKey}`,
    );
    throw new NotificationEmailOutcomeUnknownError();
  }
  if (claim === 'RETRY_PENDING') {
    throw new NotificationEmailRetryNotDueError();
  }
  if (claim === 'DEAD') {
    throw new NotificationEmailDeliveryDeadError();
  }

  const message = {
    from: smtp.fromAddress,
    to: input.toAddress,
    subject: input.subject,
    text: input.text,
    ...(input.html === undefined ? {} : { html: input.html }),
    ...(input.replyTo === undefined ? {} : { replyTo: input.replyTo }),
    messageId,
    ...(input.headers === undefined ? {} : { headers: input.headers }),
    ...(input.attachments === undefined ? {} : { attachments: input.attachments }),
  };

  let receipt: MailTransportResult;
  try {
    receipt = await mailTransport.send(message, smtp);
  } catch (error) {
    const failure = classifyMailSendError(error);
    if (isAmbiguousMailSendError(error)) {
      await markNotificationEmailDeliveryUnknown(prisma, {
        userId: input.userId,
        dedupeKey: input.dedupeKey,
        errorCode: 'ambiguous_outcome',
        responseCode: failure.responseCode,
      }).catch(() => undefined);
      logger.warn(
        `notification_email_delivery_unknown fingerprint=${deliveryFingerprint(input)} template=${input.templateKey} reason=ambiguous_provider_outcome`,
      );
      throw new NotificationEmailOutcomeUnknownError();
    }

    const permanent = isPermanentRecipientFailure(failure.kind);
    await markNotificationEmailDeliveryFailed(
      prisma,
      {
        userId: input.userId,
        dedupeKey: input.dedupeKey,
        errorCode: failure.kind,
        responseCode: failure.responseCode,
        permanent,
      },
    );
    throw error;
  }

  const hasAcceptedRecipient = receipt.acceptedRecipientCount > 0;
  const hasRejectedRecipient = receipt.rejectedRecipientCount > 0;
  const finalResponseAccepted =
    receipt.responseCode !== null && receipt.responseCode >= 200 && receipt.responseCode < 300;
  if (
    hasAcceptedRecipient &&
    !hasRejectedRecipient &&
    finalResponseAccepted &&
    receipt.failureKind === null
  ) {
    let updated: number;
    try {
      updated = await markNotificationEmailDeliverySent(
        prisma,
        { userId: input.userId, dedupeKey: input.dedupeKey },
        receipt,
      );
    } catch {
      throw new NotificationEmailOutcomeUnknownError();
    }
    if (updated === 0) {
      logger.warn(
        `notification_email_delivery_receipt_not_persisted fingerprint=${deliveryFingerprint(input)} template=${input.templateKey}`,
      );
      throw new NotificationEmailOutcomeUnknownError();
    }
    return;
  }

  if (hasAcceptedRecipient || finalResponseAccepted) {
    const errorCode =
      hasAcceptedRecipient && hasRejectedRecipient
        ? 'partial_acceptance'
        : 'missing_provider_receipt';
    await markNotificationEmailDeliveryUnknown(prisma, {
      userId: input.userId,
      dedupeKey: input.dedupeKey,
      errorCode,
      responseCode: receipt.responseCode,
      providerMessageId: receipt.messageId,
    }).catch(() => undefined);
    logger.warn(
      `notification_email_delivery_unknown fingerprint=${deliveryFingerprint(input)} template=${input.templateKey} reason=${errorCode}`,
    );
    throw new NotificationEmailOutcomeUnknownError();
  }

  if (!hasRejectedRecipient && receipt.responseCode === null && receipt.failureKind === null) {
    await markNotificationEmailDeliveryUnknown(prisma, {
      userId: input.userId,
      dedupeKey: input.dedupeKey,
      errorCode: 'missing_provider_receipt',
      providerMessageId: receipt.messageId,
    }).catch(() => undefined);
    throw new NotificationEmailOutcomeUnknownError();
  }

  const errorCode = receipt.failureKind ?? 'transient';
  const permanent = isPermanentRecipientFailure(errorCode);
  await markNotificationEmailDeliveryFailed(prisma, {
    userId: input.userId,
    dedupeKey: input.dedupeKey,
    errorCode,
    responseCode: receipt.responseCode,
    permanent,
  });
  throw createClassifiedMailFailure(errorCode, receipt.responseCode);
}

function createClassifiedMailFailure(
  kind: MailSendFailureKind,
  responseCode: number | null,
): Error {
  const safeResponseByKind: Record<MailSendFailureKind, string> = {
    dailyLimit: '550-5.4.5 Daily user sending limit exceeded',
    rateLimit: '421 Too many connections; try again later',
    auth: '535 Authentication failed',
    recipient: '550 recipient address rejected',
    transient: '451 Temporary SMTP delivery failure',
  };
  const fallbackCodeByKind: Record<MailSendFailureKind, number> = {
    dailyLimit: 550,
    rateLimit: 421,
    auth: 535,
    recipient: 550,
    transient: 451,
  };
  const failure = new Error(`SMTP delivery failed (${kind})`);
  return Object.assign(failure, {
    code: kind === 'auth' ? 'EAUTH' : 'EENVELOPE',
    responseCode: responseCode ?? fallbackCodeByKind[kind],
    response: safeResponseByKind[kind],
    command: 'RCPT TO',
  });
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
