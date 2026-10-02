import { createHash } from 'node:crypto';
import type { EmailLocale } from '../../notifications/email/email-template.constants';
import type { EmailTemplateRegistry } from '../../notifications/email/email-template.types';
import type { EmailChannelConfiguration } from '../../notifications/email/load-email-channel-configuration';
import { renderEmailMessage, type EmailReportTable } from '../../notifications/email/render-email-message';
import type { RetentionCategory } from '../privacy.constants';

export type PrivacyEmailKey = 'privacy.retention_weekly' | 'privacy.erasure_completed' | 'report.schedule_paused';

export type ComposedPrivacyEmail = {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
  readonly messageId: string;
  readonly headers: Readonly<Record<string, string>>;
};

/** Fixed copy (tables, footers); the editable parts live in the template registry. */
export const privacyEmailLabels = {
  bs: {
    retentionTitle: 'Uklonjeno po kategorijama',
    retentionColumns: ['Kategorija', 'Stavki', 'Pokretanja'],
    retentionFooter: 'Primate ovu poruku jer imate dozvolu za upravljanje zaštitom podataka.',
    categories: {
      attachments: 'Prilozi',
      ticketContent: 'Sadržaj tiketa',
      audit: 'Dnevnik revizije',
      sessions: 'Sesije',
      emailDeliveries: 'Isporuke e-pošte',
      requestRegister: 'Registar zahtjeva',
    } satisfies Record<RetentionCategory, string>,
    partial: 'Neka pokretanja nisu završila u noćnom prozoru i nastavljaju se sljedeće noći.',
    erasureTitle: 'Izmijenjeno po tabelama',
    erasureColumns: ['Stavka', 'Broj'],
    erasureFooter: 'Primate ovu poruku jer ste pokrenuli ili odobrili anonimizaciju.',
    scheduleFooter: 'Primate ovu poruku jer ste vlasnik zakazanog izvještaja.',
  },
  en: {
    retentionTitle: 'Removed per category',
    retentionColumns: ['Category', 'Items', 'Runs'],
    retentionFooter: 'You receive this message because you manage data protection.',
    categories: {
      attachments: 'Attachments',
      ticketContent: 'Ticket content',
      audit: 'Audit log',
      sessions: 'Sessions',
      emailDeliveries: 'E-mail deliveries',
      requestRegister: 'Request register',
    } satisfies Record<RetentionCategory, string>,
    partial: 'Some runs did not finish within the nightly window and continue the next night.',
    erasureTitle: 'Changed per table',
    erasureColumns: ['Item', 'Count'],
    erasureFooter: 'You receive this message because you requested or approved the anonymization.',
    scheduleFooter: 'You receive this message because you own the scheduled report.',
  },
} as const;

export function composePrivacyEmail(input: {
  readonly configuration: EmailChannelConfiguration;
  readonly templates?: EmailTemplateRegistry;
  readonly key: PrivacyEmailKey;
  readonly locale: EmailLocale;
  readonly recipientId: string;
  readonly recipientName: string;
  /** `reportPeriod` (weekly) or `reportName` (pseudonym / schedule name). */
  readonly variables: { readonly reportPeriod?: string; readonly reportName?: string };
  readonly tables: readonly EmailReportTable[];
  readonly notes: readonly string[];
  readonly footerReason: string;
  /** App path for the button, e.g. `/privacy?tab=retention`. */
  readonly ctaPath: string;
  readonly dedupeKey: string;
}): ComposedPrivacyEmail {
  const presentation = input.configuration.presentation;
  const templates = input.templates ?? input.configuration.templates;
  const rendered = renderEmailMessage({
    template: templates[input.locale][input.key],
    locale: input.locale,
    variables: {
      recipientName: input.recipientName,
      appName: presentation.appName,
      reportPeriod: input.variables.reportPeriod ?? '',
      reportName: input.variables.reportName ?? '',
    },
    appName: presentation.appName,
    brand: presentation.brand,
    accentColor: presentation.accentColor,
    confidential: false,
    ticket: null,
    excerpt: null,
    ctaUrl: presentation.publicUrl === null ? null : `${presentation.publicUrl}${input.ctaPath}`,
    replyMode: 'no_reply',
    manageUrl: null,
    report: { tables: input.tables, notes: input.notes, footerReason: input.footerReason },
  });
  const domain = mailDomain(input.configuration.smtp?.fromAddress);
  return {
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    messageId: `<${createHash('sha256').update(`${input.dedupeKey}:${input.recipientId}`).digest('hex').slice(0, 32)}@${domain}>`,
    headers: { 'Auto-Submitted': 'auto-generated', 'X-Auto-Response-Suppress': 'All' },
  };
}

function mailDomain(fromAddress: string | undefined): string {
  const domain = (fromAddress ?? '').split('@')[1]?.trim().toLowerCase() ?? '';
  return /^[a-z0-9.-]+$/.test(domain) && domain.length > 0 ? domain : 'ephelpdesk.local';
}

/** Sample e-mails for the template editor preview (same code path as real ones). */
export function composePrivacyEmailPreview(input: {
  readonly configuration: EmailChannelConfiguration;
  readonly templates: EmailTemplateRegistry;
  readonly key: PrivacyEmailKey;
  readonly locale: EmailLocale;
  readonly recipientName: string;
}): ComposedPrivacyEmail {
  const labels = privacyEmailLabels[input.locale];
  const base = {
    configuration: input.configuration,
    templates: input.templates,
    key: input.key,
    locale: input.locale,
    recipientId: 'preview',
    recipientName: input.recipientName,
    dedupeKey: `preview:${input.key}`,
  };
  if (input.key === 'privacy.retention_weekly') {
    return composePrivacyEmail({
      ...base,
      variables: { reportPeriod: input.locale === 'bs' ? '21.–27. 9. 2026.' : '21–27 Sep 2026' },
      tables: [
        {
          title: labels.retentionTitle,
          columns: labels.retentionColumns,
          rows: [
            { cells: [labels.categories.sessions, '1.204', '7'] },
            { cells: [labels.categories.emailDeliveries, '3.918', '7'] },
          ],
        },
      ],
      notes: [],
      footerReason: labels.retentionFooter,
      ctaPath: '/privacy?tab=retention',
    });
  }
  if (input.key === 'privacy.erasure_completed') {
    return composePrivacyEmail({
      ...base,
      variables: { reportName: input.locale === 'bs' ? 'Bivši korisnik #7F3A' : 'Former user #7F3A' },
      tables: [erasureTable(input.locale, { tickets: 42, messages: 318, sessions: 12, auditRedacted: 57 })],
      notes: [],
      footerReason: labels.erasureFooter,
      ctaPath: '/privacy?tab=anonymization',
    });
  }
  return composePrivacyEmail({
    ...base,
    variables: { reportName: input.locale === 'bs' ? 'Mjesečni KPI — IT podrška' : 'Monthly KPI — IT support' },
    tables: [],
    notes: [],
    footerReason: labels.scheduleFooter,
    ctaPath: '/reports?tab=schedules',
  });
}

const erasureItemLabels: Readonly<Record<EmailLocale, Readonly<Record<string, string>>>> = {
  bs: {
    tickets: 'Tiketi (tekst)',
    messages: 'Poruke',
    textReplacements: 'Zamjene u tekstu',
    activities: 'Aktivnosti',
    notificationsScrubbed: 'Obavještenja drugih',
    notificationsDeleted: 'Vlastita obavještenja',
    sessions: 'Sesije',
    roles: 'Uloge',
    groups: 'Grupe',
    attachmentsDeleted: 'Obrisani prilozi',
    inboundEmails: 'Ulazni e-mailovi',
    reportSchedulesPaused: 'Pauzirani izvještaji',
    ticketsOnLegalHoldSkipped: 'Tiketi pod pravnom blokadom (preskočeni)',
    auditRedacted: 'Redigovani audit zapisi',
  },
  en: {
    tickets: 'Tickets (text)',
    messages: 'Messages',
    textReplacements: 'Text replacements',
    activities: 'Activities',
    notificationsScrubbed: "Others' notifications",
    notificationsDeleted: 'Own notifications',
    sessions: 'Sessions',
    roles: 'Roles',
    groups: 'Groups',
    attachmentsDeleted: 'Deleted attachments',
    inboundEmails: 'Inbound e-mails',
    reportSchedulesPaused: 'Paused reports',
    ticketsOnLegalHoldSkipped: 'Tickets under legal hold (skipped)',
    auditRedacted: 'Redacted audit entries',
  },
};

/** Counts of an erasure report; unknown keys keep their technical name. */
export function erasureTable(locale: EmailLocale, report: Readonly<Record<string, unknown>>): EmailReportTable {
  const labels = privacyEmailLabels[locale];
  const format = new Intl.NumberFormat(locale === 'bs' ? 'bs-BA' : 'en-GB');
  const rows = Object.entries(report)
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && entry[1] > 0)
    .map(([key, value]) => ({ cells: [erasureItemLabels[locale][key] ?? key, format.format(value)] }));
  return { title: labels.erasureTitle, columns: labels.erasureColumns, rows, empty: '—' };
}
