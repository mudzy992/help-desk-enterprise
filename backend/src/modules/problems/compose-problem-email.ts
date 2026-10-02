import { createHash } from 'node:crypto';
import type { EmailLocale } from '../notifications/email/email-template.constants';
import type { EmailTemplateRegistry } from '../notifications/email/email-template.types';
import type { EmailChannelConfiguration } from '../notifications/email/load-email-channel-configuration';
import { renderEmailMessage } from '../notifications/email/render-email-message';

export type ProblemEmailKey = 'problem.assigned' | 'problem.resolved' | 'problem.target_due';

export type ProblemEmailFacts = {
  readonly id: string;
  readonly number: string;
  readonly title: string;
  readonly status: string;
  readonly priority: string;
  readonly ownerName: string | null;
  /** Formatted target date, or null. */
  readonly target: string | null;
};

const labels = {
  bs: {
    columns: ['Problem', 'Status', 'Prioritet', 'Vlasnik', 'Rok'],
    table: 'Problem',
    status: { NEW: 'Novi', INVESTIGATING: 'U analizi', KNOWN_ERROR: 'Poznata greška', RESOLVED: 'Riješen', CLOSED: 'Zatvoren', CANCELLED: 'Otkazan' } as Record<string, string>,
    priority: { LOW: 'Nizak', MEDIUM: 'Srednji', HIGH: 'Visok', CRITICAL: 'Kritičan' } as Record<string, string>,
    footer: {
      'problem.assigned': 'Ovu poruku dobijate kao vlasnik problema.',
      'problem.resolved': 'Ovu poruku dobijate jer radite na otvorenom tiketu povezanom s problemom.',
      'problem.target_due': 'Ovu poruku dobijate kao vlasnik problema (ili član grupe kad problem nema vlasnika).',
    },
    none: '—',
  },
  en: {
    columns: ['Problem', 'Status', 'Priority', 'Owner', 'Target'],
    table: 'Problem',
    status: { NEW: 'New', INVESTIGATING: 'Investigating', KNOWN_ERROR: 'Known error', RESOLVED: 'Resolved', CLOSED: 'Closed', CANCELLED: 'Cancelled' } as Record<string, string>,
    priority: { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High', CRITICAL: 'Critical' } as Record<string, string>,
    footer: {
      'problem.assigned': 'You receive this as the problem owner.',
      'problem.resolved': 'You receive this because you work on an open ticket linked to the problem.',
      'problem.target_due': 'You receive this as the problem owner (or a group member when there is no owner).',
    },
    none: '—',
  },
} as const;

export function problemStatusLabel(locale: EmailLocale, status: string): string {
  return labels[locale].status[status] ?? status;
}

/** Paket 3.3 (P5, §11): one problem notice (owner, resolved, target). */
export function composeProblemEmail(input: {
  readonly configuration: EmailChannelConfiguration;
  readonly templates?: EmailTemplateRegistry;
  readonly key: ProblemEmailKey;
  readonly locale: EmailLocale;
  readonly recipientKey: string;
  readonly recipientName: string;
  readonly problem: ProblemEmailFacts;
  /** Shown as `{{reportPeriod}}`: status, or the target date for reminders. */
  readonly detail: string;
  readonly dedupeKey: string;
}) {
  const presentation = input.configuration.presentation;
  const templates = input.templates ?? input.configuration.templates;
  const text = labels[input.locale];
  const problem = input.problem;
  const rendered = renderEmailMessage({
    template: templates[input.locale][input.key],
    locale: input.locale,
    variables: {
      recipientName: input.recipientName,
      appName: presentation.appName,
      reportName: `${problem.number} · ${problem.title}`,
      reportPeriod: input.detail,
    },
    appName: presentation.appName,
    brand: presentation.brand,
    accentColor: presentation.accentColor,
    confidential: false,
    ticket: null,
    excerpt: null,
    ctaUrl: presentation.publicUrl === null ? null : `${presentation.publicUrl}/problems/${problem.id}`,
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
                `${problem.number} · ${problem.title}`,
                problemStatusLabel(input.locale, problem.status),
                text.priority[problem.priority] ?? problem.priority,
                problem.ownerName ?? text.none,
                problem.target ?? text.none,
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

/** Editor preview with a realistic problem (same code path). */
export function composeProblemEmailPreview(input: {
  readonly configuration: EmailChannelConfiguration;
  readonly templates: EmailTemplateRegistry;
  readonly key: ProblemEmailKey;
  readonly locale: EmailLocale;
  readonly recipientName: string;
}) {
  const bs = input.locale === 'bs';
  const target = '07.10.2026.';
  return composeProblemEmail({
    ...input,
    recipientKey: 'preview',
    dedupeKey: `preview:${input.key}`,
    problem: {
      id: 'preview',
      number: 'P-000042',
      title: bs ? 'Štampači u sjedištu povremeno gube red čekanja' : 'Head office printers intermittently lose the queue',
      status: input.key === 'problem.resolved' ? 'RESOLVED' : 'INVESTIGATING',
      priority: 'HIGH',
      ownerName: bs ? 'Amra Hodžić' : 'Alex Morgan',
      target,
    },
    detail: input.key === 'problem.target_due' ? target : problemStatusLabel(input.locale, input.key === 'problem.resolved' ? 'RESOLVED' : 'INVESTIGATING'),
  });
}
