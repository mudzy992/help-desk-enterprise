import { composeTicketEmail } from './compose-ticket-email';
import type { EmailLocale, EmailTemplateKey } from './email-template.constants';
import type { EmailTemplateRegistry } from './email-template.types';
import type { EmailChannelConfiguration } from './load-email-channel-configuration';
import { renderEmailMessage, type RenderedEmailMessage } from './render-email-message';

const sampleTicket = {
  id: 'preview-ticket',
  ticketNumber: 'HD-2026-000123',
  status: 'ASSIGNED',
  priority: 'HIGH',
  classification: 'INTERNAL',
} as const;

const sampleText: Readonly<
  Record<
    EmailLocale,
    { title: string; service: string; group: string; actor: string; excerpt: string }
  >
> = {
  bs: {
    title: 'VPN ne radi nakon promjene lozinke',
    service: 'VPN pristup',
    group: 'IT podrška',
    actor: 'Amra Hodžić',
    excerpt:
      'Poštovani, resetovali smo vaš VPN profil. Molimo odjavite se, ponovo prijavite i javite nam da li veza radi.',
  },
  en: {
    title: 'VPN stopped working after a password change',
    service: 'VPN access',
    group: 'IT support',
    actor: 'Amra Hodžić',
    excerpt:
      'Hello, we reset your VPN profile. Please sign out, sign in again and let us know whether the connection works.',
  },
};

/**
 * Renders a template with sample data — the same code path as real e-mails,
 * so what the admin sees is what recipients get.
 */
export function renderEmailTemplatePreview(input: {
  readonly configuration: EmailChannelConfiguration;
  readonly templates: EmailTemplateRegistry;
  readonly key: EmailTemplateKey;
  readonly locale: EmailLocale;
  readonly confidential: boolean;
  readonly recipientName: string;
  readonly recipientEmail: string;
}): RenderedEmailMessage {
  const { configuration, locale } = input;
  const sample = sampleText[locale];
  if (input.key === 'user.temporary_password') {
    const loginUrl =
      configuration.presentation.publicUrl === null
        ? null
        : `${configuration.presentation.publicUrl}/login`;
    return renderEmailMessage({
      template: input.templates[locale]['user.temporary_password'],
      locale,
      variables: {
        displayName: input.recipientName,
        email: input.recipientEmail,
        temporaryPassword: 'Xk7#pQ2m-Preview',
        loginUrl: loginUrl ?? '',
        appName: configuration.presentation.appName,
      },
      appName: configuration.presentation.appName,
      accentColor: configuration.presentation.accentColor,
      confidential: false,
      ticket: null,
      excerpt: null,
      ctaUrl: loginUrl,
      replyMode: 'no_reply',
    });
  }
  const composed = composeTicketEmail({
    configuration,
    templates: input.templates,
    key: input.key,
    locale,
    ticket: {
      ...sampleTicket,
      title: sample.title,
      isConfidential: input.confidential,
    },
    serviceName: sample.service,
    groupName: sample.group,
    recipientName: input.recipientName,
    actorName: sample.actor,
    event: input.key,
    excerpt:
      input.key === 'ticket.message' || input.key === 'ticket.broadcast' ? sample.excerpt : null,
    dedupeKey: `preview:${input.key}`,
    recipientId: 'preview',
  });
  return { subject: composed.subject, html: composed.html, text: composed.text };
}
