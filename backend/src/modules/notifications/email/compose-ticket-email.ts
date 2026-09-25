import { createHash } from 'node:crypto';
import type { EmailChannelConfiguration } from './load-email-channel-configuration';
import { emailLayoutLabels } from './email-layout-labels';
import {
  emailLocales,
  type EmailLocale,
  type EmailTemplateKey,
} from './email-template.constants';
import type { EmailTemplateRegistry } from './email-template.types';
import { renderEmailMessage, type RenderedEmailMessage } from './render-email-message';
import {
  emailDescriptionFullMaxLength,
  emailDescriptionShortMaxLength,
} from './email-template.constants';
import { redactSensitiveText } from '../../tickets/redaction/redact-sensitive-text';
import { defaultTicketRedactionConfiguration } from '../../tickets/redaction/redaction.constants';
import type { TicketRedactionConfiguration } from '../../tickets/redaction/redaction.types';

export type EmailTicketFacts = {
  readonly id: string;
  readonly ticketNumber: string;
  readonly title: string;
  readonly status: string;
  readonly priority: string;
  readonly classification?: string | null;
  readonly isConfidential: boolean;
  readonly description?: string | null;
};

export type ComposedTicketEmail = RenderedEmailMessage & {
  readonly replyTo?: string;
  readonly messageId: string;
  readonly headers: Readonly<Record<string, string>>;
};

/** Decision E3: flagged tickets and CONFIDENTIAL/RESTRICTED classification. */
export function isConfidentialForEmail(ticket: EmailTicketFacts): boolean {
  return (
    ticket.isConfidential ||
    ticket.classification === 'CONFIDENTIAL' ||
    ticket.classification === 'RESTRICTED'
  );
}

/** Preferred language when supported, otherwise the configured default. */
export function resolveEmailLocale(
  preferred: string | null | undefined,
  configuration: Pick<EmailChannelConfiguration, 'presentation'>,
): EmailLocale {
  const { supportedLocales, defaultLocale, fallbackLocale } = configuration.presentation;
  if (preferred !== null && preferred !== undefined) {
    const normalized = preferred.toLowerCase().slice(0, 2);
    if ((supportedLocales as readonly string[]).includes(normalized)) {
      return normalized as EmailLocale;
    }
  }
  if (supportedLocales.includes(defaultLocale)) {
    return defaultLocale;
  }
  return supportedLocales[0] ?? fallbackLocale ?? emailLocales[0];
}

export function composeTicketEmail(input: {
  readonly configuration: EmailChannelConfiguration;
  readonly templates?: EmailTemplateRegistry;
  readonly key: EmailTemplateKey;
  readonly locale: EmailLocale;
  readonly ticket: EmailTicketFacts;
  readonly serviceName: string;
  readonly groupName: string;
  readonly recipientName: string;
  readonly actorName: string;
  readonly event: string;
  readonly excerpt: string | null;
  /** Unique per event (dedupe key) + recipient → stable Message-ID across retries. */
  readonly dedupeKey: string;
  readonly recipientId: string;
}): ComposedTicketEmail {
  const { configuration, ticket, locale } = input;
  const presentation = configuration.presentation;
  const labels = emailLayoutLabels[locale];
  const confidential = isConfidentialForEmail(ticket);
  const ticketUrl =
    presentation.publicUrl === null
      ? null
      : `${presentation.publicUrl}/tickets/${encodeURIComponent(ticket.id)}`;
  const statusLabel = labels.statuses[ticket.status] ?? ticket.status;
  const priorityLabel = labels.priorities[ticket.priority] ?? ticket.priority;
  const templates = input.templates ?? configuration.templates;
  const description = redactForEmail(ticket.description ?? '');
  const rendered = renderEmailMessage({
    template: templates[locale][input.key],
    locale,
    variables: {
      ticketNumber: ticket.ticketNumber,
      ticketTitle: ticket.title,
      ticketId: ticket.id,
      ticketUrl: ticketUrl ?? '',
      ticketDescription: clip(description, emailDescriptionFullMaxLength),
      ticketDescriptionShort: clip(description, emailDescriptionShortMaxLength),
      type: input.key,
      event: input.event,
      recipientName: input.recipientName,
      serviceName: input.serviceName,
      statusLabel,
      priorityLabel,
      groupName: input.groupName,
      actorName: input.actorName,
      appName: presentation.appName,
    },
    appName: presentation.appName,
    accentColor: presentation.accentColor,
    confidential,
    ticket: {
      number: ticket.ticketNumber,
      title: ticket.title,
      serviceName: input.serviceName,
      statusLabel,
      priorityLabel,
    },
    // A broadcast without its text would be empty, so the setting applies to replies only.
    excerpt:
      input.key === 'ticket.broadcast' || presentation.includeMessageExcerpt ? input.excerpt : null,
    ctaUrl: ticketUrl,
    replyMode: presentation.replyMode,
  });
  const domain = mailDomain(configuration.smtp?.fromAddress);
  const threadRoot = `<ticket-${ticket.id}@${domain}>`;
  const messageId = `<${digest(`${input.dedupeKey}:${input.recipientId}`)}@${domain}>`;
  return {
    ...rendered,
    messageId,
    ...(presentation.replyToAddress === null ? {} : { replyTo: presentation.replyToAddress }),
    headers: {
      // Decision E6: every e-mail of a ticket joins one conversation.
      'In-Reply-To': threadRoot,
      References: threadRoot,
      // RFC 3834 + Exchange: no out-of-office storms back into the system.
      'Auto-Submitted': 'auto-generated',
      'X-Auto-Response-Suppress': 'All',
      'X-EPHD-Ticket': ticket.ticketNumber,
    },
  };
}

/** E-mail leaves the system: default redaction patterns always apply. */
export function redactForEmail(value: string): string {
  return redactSensitiveText(value, {
    ...defaultTicketRedactionConfiguration,
    enabled: true,
  } as unknown as TicketRedactionConfiguration).trim();
}

function clip(value: string, max: number): string {
  const normalized = value.replace(/\r\n/g, '\n').trim();
  return normalized.length <= max ? normalized : `${normalized.slice(0, max - 1).trimEnd()}…`;
}

function mailDomain(fromAddress: string | undefined): string {
  const domain = (fromAddress ?? '').split('@')[1]?.trim().toLowerCase() ?? '';
  return /^[a-z0-9.-]+$/.test(domain) && domain.length > 0 ? domain : 'ephelpdesk.local';
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 32);
}
