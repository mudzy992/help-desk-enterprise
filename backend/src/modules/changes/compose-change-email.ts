import { createHash } from 'node:crypto';
import type { EmailLocale } from '../notifications/email/email-template.constants';
import type { EmailTemplateRegistry } from '../notifications/email/email-template.types';
import type { EmailChannelConfiguration } from '../notifications/email/load-email-channel-configuration';
import { renderEmailMessage } from '../notifications/email/render-email-message';

export type ChangeEmailKey = 'change.approval_requested' | 'change.decided' | 'change.starting_soon' | 'change.overdue';

export type ChangeEmailFacts = {
  readonly id: string;
  readonly number: string;
  readonly title: string;
  readonly type: string;
  readonly status: string;
  readonly risk: string;
  /** Formatted planned window, or null. */
  readonly window: string | null;
};

const labels = {
  bs: {
    columns: ['Promjena', 'Tip', 'Status', 'Rizik', 'Termin'],
    table: 'Promjena',
    type: { STANDARD: 'Standardna', NORMAL: 'Normalna', EMERGENCY: 'Hitna' } as Record<string, string>,
    status: {
      DRAFT: 'Nacrt',
      ASSESSMENT: 'Procjena',
      AUTHORIZATION: 'Odobravanje',
      SCHEDULED: 'Zakazana',
      IMPLEMENTING: 'U realizaciji',
      REVIEW: 'Pregled',
      CLOSED: 'Zatvorena',
      REJECTED: 'Odbijena',
      CANCELLED: 'Otkazana',
    } as Record<string, string>,
    risk: { LOW: 'Nizak', MEDIUM: 'Srednji', HIGH: 'Visok', CRITICAL: 'Kritičan' } as Record<string, string>,
    decision: { APPROVED: 'odobrena i zakazana', REJECTED: 'odbijena' } as Record<string, string>,
    footer: {
      'change.approval_requested': 'Ovu poruku dobijate kao član CAB-a s pravom glasa.',
      'change.decided': 'Ovu poruku dobijate kao podnosilac ili vlasnik promjene.',
      'change.starting_soon': 'Ovu poruku dobijate kao vlasnik promjene (ili podnosilac kad vlasnika nema).',
      'change.overdue': 'Ovu poruku dobijate kao vlasnik promjene (ili član CAB-a kad vlasnika nema).',
    },
    none: '—',
  },
  en: {
    columns: ['Change', 'Type', 'Status', 'Risk', 'Window'],
    table: 'Change',
    type: { STANDARD: 'Standard', NORMAL: 'Normal', EMERGENCY: 'Emergency' } as Record<string, string>,
    status: {
      DRAFT: 'Draft',
      ASSESSMENT: 'Assessment',
      AUTHORIZATION: 'Authorization',
      SCHEDULED: 'Scheduled',
      IMPLEMENTING: 'Implementing',
      REVIEW: 'Review',
      CLOSED: 'Closed',
      REJECTED: 'Rejected',
      CANCELLED: 'Cancelled',
    } as Record<string, string>,
    risk: { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High', CRITICAL: 'Critical' } as Record<string, string>,
    decision: { APPROVED: 'approved and scheduled', REJECTED: 'rejected' } as Record<string, string>,
    footer: {
      'change.approval_requested': 'You receive this as a voting CAB member.',
      'change.decided': 'You receive this as the requester or owner of the change.',
      'change.starting_soon': 'You receive this as the change owner (or the requester when there is no owner).',
      'change.overdue': 'You receive this as the change owner (or a CAB member when there is no owner).',
    },
    none: '—',
  },
} as const;

export function changeStatusLabel(locale: EmailLocale, status: string): string {
  return labels[locale].status[status] ?? status;
}

export function changeDecisionLabel(locale: EmailLocale, decision: string): string {
  return labels[locale].decision[decision] ?? decision;
}

export function changeTypeLabel(locale: EmailLocale, type: string): string {
  return labels[locale].type[type] ?? type;
}

/** Paket 3.4 (§14): one change notice (CAB vote, decision, start reminder, overrun). */
export function composeChangeEmail(input: {
  readonly configuration: EmailChannelConfiguration;
  readonly templates?: EmailTemplateRegistry;
  readonly key: ChangeEmailKey;
  readonly locale: EmailLocale;
  readonly recipientKey: string;
  readonly recipientName: string;
  readonly change: ChangeEmailFacts;
  /** Shown as `{{reportPeriod}}`: type, decision or a formatted instant. */
  readonly detail: string;
  readonly dedupeKey: string;
}) {
  const presentation = input.configuration.presentation;
  const templates = input.templates ?? input.configuration.templates;
  const text = labels[input.locale];
  const change = input.change;
  const rendered = renderEmailMessage({
    template: templates[input.locale][input.key],
    locale: input.locale,
    variables: {
      recipientName: input.recipientName,
      appName: presentation.appName,
      reportName: `${change.number} · ${change.title}`,
      reportPeriod: input.detail,
    },
    appName: presentation.appName,
    accentColor: presentation.accentColor,
    confidential: false,
    ticket: null,
    excerpt: null,
    ctaUrl: presentation.publicUrl === null ? null : `${presentation.publicUrl}/changes/${change.id}`,
    replyMode: 'no_reply',
    manageUrl: null,
    report: {
      tables: [
        {
          title: text.table,
          columns: [...text.columns],
          rows: [
            {
              cells: [
                `${change.number} · ${change.title}`,
                text.type[change.type] ?? change.type,
                changeStatusLabel(input.locale, change.status),
                text.risk[change.risk] ?? change.risk,
                change.window ?? text.none,
              ],
            },
          ],
        },
      ],
      notes: [],
      footerReason: text.footer[input.key],
    },
  });
  const domain = (input.configuration.smtp?.fromAddress ?? '').split('@')[1]?.trim().toLowerCase() || 'ephelpdesk.local';
  return {
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    messageId: `<${createHash('sha256').update(`${input.dedupeKey}:${input.recipientKey}`).digest('hex').slice(0, 32)}@${domain}>`,
    headers: { 'Auto-Submitted': 'auto-generated', 'X-Auto-Response-Suppress': 'All' },
  };
}

/** Editor preview with a realistic change (same code path). */
export function composeChangeEmailPreview(input: {
  readonly configuration: EmailChannelConfiguration;
  readonly templates: EmailTemplateRegistry;
  readonly key: ChangeEmailKey;
  readonly locale: EmailLocale;
  readonly recipientName: string;
}) {
  const bs = input.locale === 'bs';
  const window = '10.10.2026. 18:00 – 20:00';
  const status = input.key === 'change.approval_requested' ? 'AUTHORIZATION' : input.key === 'change.overdue' ? 'IMPLEMENTING' : 'SCHEDULED';
  const detail =
    input.key === 'change.approval_requested'
      ? changeTypeLabel(input.locale, 'NORMAL')
      : input.key === 'change.decided'
        ? changeDecisionLabel(input.locale, 'APPROVED')
        : input.key === 'change.overdue'
          ? '10.10.2026. 20:00'
          : '10.10.2026. 18:00';
  return composeChangeEmail({
    ...input,
    recipientKey: 'preview',
    dedupeKey: `preview:${input.key}`,
    change: {
      id: 'preview',
      number: 'CHG-000042',
      title: bs ? 'Nadogradnja firmvera core switcha u sjedištu' : 'Head office core switch firmware upgrade',
      type: 'NORMAL',
      status,
      risk: 'MEDIUM',
      window,
    },
    detail,
  });
}
