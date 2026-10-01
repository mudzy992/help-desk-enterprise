import { composeAnnouncementEmailPreview } from '../../announcements/compose-announcement-email';
import { composeAssetReminderEmailPreview } from '../../assets/reminders/compose-asset-reminder-email';
import { composeProblemEmailPreview } from '../../problems/compose-problem-email';
import { composeOpsAlertEmailPreview } from '../../ops-health/compose-ops-alert-email';
import { isoWeek } from '../preferences/weekly-ticket-report';
import { composeWeeklyTicketReportEmail } from './compose-weekly-ticket-report-email';
import { composeDigestEmail } from './compose-digest-email';
import { composeTicketEmail } from './compose-ticket-email';
import type { EmailLocale, EmailTemplateKey } from './email-template.constants';
import type { EmailTemplateRegistry } from './email-template.types';
import type { EmailChannelConfiguration } from './load-email-channel-configuration';
import { renderEmailMessage, type RenderedEmailMessage } from './render-email-message';
import { composeScheduledReportPreview } from '../../reports/schedules/scheduled-report-preview';
import { composePrivacyEmailPreview } from '../../privacy/notices/compose-privacy-email';

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
    { title: string; description: string; service: string; group: string; actor: string; excerpt: string }
  >
> = {
  bs: {
    title: 'VPN ne radi nakon promjene lozinke',
    description:
      'Nakon jučerašnje promjene lozinke VPN klijent javlja grešku 809 i ne uspostavlja vezu.\n\nPokušao sam restart računara i ponovnu instalaciju klijenta. Radim od kuće i ne mogu pristupiti internim aplikacijama. Molim hitnu pomoć jer sutra imam rok za izvještaj.',
    service: 'VPN pristup',
    group: 'IT podrška',
    actor: 'Amra Hodžić',
    excerpt:
      'Poštovani, resetovali smo vaš VPN profil. Molimo odjavite se, ponovo prijavite i javite nam da li veza radi.',
  },
  en: {
    title: 'VPN stopped working after a password change',
    description:
      'Since yesterday\'s password change the VPN client reports error 809 and does not connect.\n\nI restarted the computer and reinstalled the client. I work from home and cannot reach internal applications. Please help urgently, I have a report due tomorrow.',
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
  if (input.key === 'notification.digest') {
    const now = Date.now();
    const tickets = new Map([
      ['preview-1', { ...sampleTicket, id: 'preview-1', title: sample.title, isConfidential: false }],
      [
        'preview-2',
        { ...sampleTicket, id: 'preview-2', ticketNumber: 'HD-2026-000124', status: 'IN_PROGRESS', title: sample.service, isConfidential: input.confidential },
      ],
    ]);
    const composed = composeDigestEmail({
      configuration,
      templates: input.templates,
      locale,
      recipientId: 'preview',
      recipientName: input.recipientName,
      items: [
        { ticketId: 'preview-1', category: 'ticket.message', createdAt: new Date(now - 60_000) },
        { ticketId: 'preview-1', category: 'ticket.assigned', createdAt: new Date(now - 3_600_000) },
        { ticketId: 'preview-2', category: 'ticket.created', createdAt: new Date(now - 7_200_000) },
      ],
      tickets,
      maxItems: 50,
      dedupeKey: 'preview:notification.digest',
    });
    return { subject: composed.subject, html: composed.html, text: composed.text };
  }
  if (input.key === 'report.weekly_tickets') {
    const now = new Date();
    const day = 86_400_000;
    const base = { ...sampleTicket, isConfidential: false, updatedAt: new Date(now.getTime() - day) };
    const composed = composeWeeklyTicketReportEmail({
      configuration,
      templates: input.templates,
      locale,
      recipientId: 'preview',
      recipientName: input.recipientName,
      entries: [
        {
          ticket: { ...base, id: 'preview-1', title: sample.title, priority: 'HIGH', createdAt: new Date(now.getTime() - 9 * day) },
          role: 'ASSIGNEE',
          section: 'overdue',
          overdue: true,
          dueAt: new Date(now.getTime() - day),
        },
        {
          ticket: { ...base, id: 'preview-2', ticketNumber: 'HD-2026-000124', status: 'IN_PROGRESS', title: sample.service, createdAt: new Date(now.getTime() - 3 * day) },
          role: 'ASSIGNEE',
          section: 'assigned',
          overdue: false,
          dueAt: new Date(now.getTime() + 2 * day),
        },
        {
          ticket: { ...base, id: 'preview-3', ticketNumber: 'HD-2026-000125', status: 'WAITING_FOR_USER', title: sample.title, isConfidential: input.confidential, createdAt: new Date(now.getTime() - 5 * day) },
          role: 'WATCHER',
          section: 'watching',
          overdue: false,
          dueAt: null,
        },
      ],
      maxRows: 100,
      timeZone: 'Europe/Sarajevo',
      week: isoWeek(now, 'Europe/Sarajevo'),
      now,
      dedupeKey: 'preview:report.weekly_tickets',
    });
    return { subject: composed.subject, html: composed.html, text: composed.text };
  }
  if (input.key === 'report.scheduled') {
    return composeScheduledReportPreview({
      configuration,
      templates: input.templates,
      locale,
      recipientName: input.recipientName,
    });
  }
  if (
    input.key === 'privacy.retention_weekly' ||
    input.key === 'privacy.erasure_completed' ||
    input.key === 'report.schedule_paused'
  ) {
    const composed = composePrivacyEmailPreview({
      configuration,
      templates: input.templates,
      key: input.key,
      locale,
      recipientName: input.recipientName,
    });
    return { subject: composed.subject, html: composed.html, text: composed.text };
  }
  if (input.key === 'announcement.published' || input.key === 'announcement.reminder') {
    const composed = composeAnnouncementEmailPreview({
      configuration,
      templates: input.templates,
      locale,
      recipientName: input.recipientName,
      kind: input.key === 'announcement.published' ? 'PUBLISHED' : 'REMINDER',
    });
    return { subject: composed.subject, html: composed.html, text: composed.text };
  }
  if (input.key === 'problem.assigned' || input.key === 'problem.resolved' || input.key === 'problem.target_due') {
    const composed = composeProblemEmailPreview({
      configuration,
      templates: input.templates,
      key: input.key,
      locale,
      recipientName: input.recipientName,
    });
    return { subject: composed.subject, html: composed.html, text: composed.text };
  }
  if (input.key === 'asset.expiring') {
    const composed = composeAssetReminderEmailPreview({
      configuration,
      templates: input.templates,
      locale,
      recipientName: input.recipientName,
    });
    return { subject: composed.subject, html: composed.html, text: composed.text };
  }
  if (input.key === 'ops.alert') {
    const composed = composeOpsAlertEmailPreview({
      configuration,
      templates: input.templates,
      locale,
      recipientName: input.recipientName,
    });
    return { subject: composed.subject, html: composed.html, text: composed.text };
  }
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
      description: sample.description,
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
