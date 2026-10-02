import { createHash } from 'node:crypto';
import type { WeeklyReportEntry } from '../preferences/weekly-ticket-report';
import { isConfidentialForEmail, type EmailTicketFacts } from './compose-ticket-email';
import { emailLayoutLabels } from './email-layout-labels';
import type { EmailLocale } from './email-template.constants';
import type { EmailTemplateRegistry } from './email-template.types';
import type { EmailChannelConfiguration } from './load-email-channel-configuration';
import { renderEmailMessage, type EmailDigestRow, type RenderedEmailMessage } from './render-email-message';

export type ComposedWeeklyReportEmail = RenderedEmailMessage & {
  readonly messageId: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly ticketCount: number;
  readonly overdueCount: number;
};

const dateLocales: Readonly<Record<EmailLocale, string>> = { bs: 'bs-BA', en: 'en-GB' };

/** Paket 2.2a (W4/W5): rows with section headings, capped at `maxRows`. */
export function buildWeeklyReportRows(input: {
  readonly entries: readonly WeeklyReportEntry[];
  readonly locale: EmailLocale;
  readonly publicUrl: string | null;
  readonly maxRows: number;
  readonly timeZone: string;
  readonly now: Date;
}): { readonly rows: EmailDigestRow[]; readonly more: string | null } {
  const labels = emailLayoutLabels[input.locale];
  const date = new Intl.DateTimeFormat(dateLocales[input.locale], {
    timeZone: input.timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const rows = input.entries.slice(0, input.maxRows).map((entry): EmailDigestRow => {
    const ticket = entry.ticket;
    const ageDays = Math.max(0, Math.floor((input.now.getTime() - ticket.createdAt.getTime()) / 86_400_000));
    const parts = [
      labels.statuses[ticket.status] ?? ticket.status,
      labels.priorities[ticket.priority] ?? ticket.priority,
      labels.weekly.roles[entry.role],
      labels.weekly.age.replace('{days}', String(ageDays)),
      labels.weekly.lastActivity.replace('{date}', date.format(ticket.updatedAt)),
      entry.overdue
        ? labels.weekly.overdue
        : entry.dueAt === null
          ? null
          : labels.weekly.due.replace('{date}', date.format(entry.dueAt)),
    ].filter((part): part is string => part !== null);
    return {
      ticketNumber: ticket.ticketNumber,
      title: isConfidentialForEmail(ticket as unknown as EmailTicketFacts) ? '' : ticket.title,
      statusLabel: labels.statuses[ticket.status] ?? ticket.status,
      eventLabel: labels.weekly.roles[entry.role],
      eventCount: 1,
      url: input.publicUrl === null ? null : `${input.publicUrl}/tickets/${encodeURIComponent(ticket.id)}`,
      section: labels.weekly.sections[entry.section],
      detail: parts.join(' · '),
      alert: entry.overdue,
    };
  });
  const hidden = input.entries.length - rows.length;
  return { rows, more: hidden > 0 ? labels.weekly.more.replace('{count}', String(hidden)) : null };
}

export function composeWeeklyTicketReportEmail(input: {
  readonly configuration: EmailChannelConfiguration;
  readonly templates?: EmailTemplateRegistry;
  readonly locale: EmailLocale;
  readonly recipientId: string;
  readonly recipientName: string;
  readonly entries: readonly WeeklyReportEntry[];
  readonly maxRows: number;
  readonly timeZone: string;
  readonly week: { readonly year: number; readonly week: number };
  readonly now: Date;
  /** `weekly:<year>-W<week>` → the same Message-ID on a retry. */
  readonly dedupeKey: string;
}): ComposedWeeklyReportEmail {
  const presentation = input.configuration.presentation;
  const labels = emailLayoutLabels[input.locale];
  const list = buildWeeklyReportRows({
    entries: input.entries,
    locale: input.locale,
    publicUrl: presentation.publicUrl,
    maxRows: input.maxRows,
    timeZone: input.timeZone,
    now: input.now,
  });
  const overdueCount = input.entries.filter((entry) => entry.overdue).length;
  const templates = input.templates ?? input.configuration.templates;
  const rendered = renderEmailMessage({
    template: templates[input.locale]['report.weekly_tickets'],
    locale: input.locale,
    variables: {
      recipientName: input.recipientName,
      ticketCount: String(input.entries.length),
      overdueCount: String(overdueCount),
      weekLabel: labels.weekly.weekLabel
        .replace('{week}', String(input.week.week))
        .replace('{year}', String(input.week.year)),
      appName: presentation.appName,
    },
    appName: presentation.appName,
    brand: presentation.brand,
    accentColor: presentation.accentColor,
    confidential: false,
    ticket: null,
    excerpt: null,
    ctaUrl: presentation.publicUrl === null ? null : `${presentation.publicUrl}/tickets?view=assigned`,
    replyMode: 'no_reply',
    manageUrl: presentation.publicUrl === null ? null : `${presentation.publicUrl}/account/notifications`,
    digest: { rows: list.rows, more: list.more, footerReason: labels.weekly.footerReason },
  });
  const domain = mailDomain(input.configuration.smtp?.fromAddress);
  return {
    ...rendered,
    ticketCount: input.entries.length,
    overdueCount,
    messageId: `<${createHash('sha256').update(`${input.dedupeKey}:${input.recipientId}`).digest('hex').slice(0, 32)}@${domain}>`,
    headers: { 'Auto-Submitted': 'auto-generated', 'X-Auto-Response-Suppress': 'All' },
  };
}

function mailDomain(fromAddress: string | undefined): string {
  const domain = (fromAddress ?? '').split('@')[1]?.trim().toLowerCase() ?? '';
  return /^[a-z0-9.-]+$/.test(domain) && domain.length > 0 ? domain : 'ephelpdesk.local';
}
