import { createHash } from 'node:crypto';
import type { EmailLocale } from '../../notifications/email/email-template.constants';
import type { EmailTemplateRegistry } from '../../notifications/email/email-template.types';
import type { EmailChannelConfiguration } from '../../notifications/email/load-email-channel-configuration';
import { renderEmailMessage } from '../../notifications/email/render-email-message';

export type AssetReminderKind = 'warranty' | 'contract' | 'license';

export type AssetReminderLine = {
  readonly kind: AssetReminderKind;
  readonly id: string;
  readonly label: string;
  readonly unitName: string;
  readonly endsAt: string;
  readonly daysLeft: number;
  /** In-app path, e.g. `/assets/<id>` or `/assets?tab=contracts&contract=<id>`. */
  readonly path: string;
};

export const assetRemindersPath = '/assets';

const labels = {
  bs: {
    kinds: { warranty: 'Garancija', contract: 'Ugovor', license: 'Licenca' },
    columns: ['Vrsta', 'Stavka', 'Organizaciona jedinica', 'Ističe', 'Dana'],
    table: 'Stavke pred istek',
    items: (count: number) => (count === 1 ? '1 stavka' : count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14) ? `${count} stavke` : `${count} stavki`),
    footer: 'Ovu poruku dobijate kao upravitelj imovine. Pragovi podsjetnika su u postavkama modula Imovina.',
    period: (date: string) => `stanje na dan ${date}`,
    today: 'danas',
  },
  en: {
    kinds: { warranty: 'Warranty', contract: 'Contract', license: 'Licence' },
    columns: ['Kind', 'Item', 'Unit', 'Expires', 'Days'],
    table: 'Items about to expire',
    items: (count: number) => (count === 1 ? '1 item' : `${count} items`),
    footer: 'You receive this as an asset manager. Reminder thresholds are in the Assets module settings.',
    period: (date: string) => `as of ${date}`,
    today: 'today',
  },
} as const;

export function assetReminderSummary(locale: EmailLocale, count: number): string {
  return labels[locale].items(count);
}

/** Paket 3.2 (§10): template `asset.expiring`, one list per recipient per day. */
export function composeAssetReminderEmail(input: {
  readonly configuration: EmailChannelConfiguration;
  readonly templates?: EmailTemplateRegistry;
  readonly locale: EmailLocale;
  readonly recipientKey: string;
  readonly recipientName: string;
  readonly lines: readonly AssetReminderLine[];
  readonly dateLabel: string;
  readonly dedupeKey: string;
}) {
  const presentation = input.configuration.presentation;
  const templates = input.templates ?? input.configuration.templates;
  const text = labels[input.locale];
  const sorted = [...input.lines].sort((a, b) => a.daysLeft - b.daysLeft || a.label.localeCompare(b.label));
  const rendered = renderEmailMessage({
    template: templates[input.locale]['asset.expiring'],
    locale: input.locale,
    variables: {
      recipientName: input.recipientName,
      appName: presentation.appName,
      reportName: text.items(sorted.length),
      reportPeriod: text.period(input.dateLabel),
    },
    appName: presentation.appName,
    accentColor: presentation.accentColor,
    confidential: false,
    ticket: null,
    excerpt: null,
    ctaUrl: presentation.publicUrl === null ? null : `${presentation.publicUrl}${assetRemindersPath}`,
    replyMode: 'no_reply',
    manageUrl: null,
    report: {
      tables: [
        {
          title: text.table,
          columns: [...text.columns],
          rows: sorted.map((line) => ({
            cells: [text.kinds[line.kind], line.label, line.unitName, line.endsAt, line.daysLeft === 0 ? text.today : String(line.daysLeft)],
          })),
        },
      ],
      notes: [],
      footerReason: text.footer,
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

/** Editor preview with realistic lines (same code path). */
export function composeAssetReminderEmailPreview(input: {
  readonly configuration: EmailChannelConfiguration;
  readonly templates: EmailTemplateRegistry;
  readonly locale: EmailLocale;
  readonly recipientName: string;
}) {
  const bs = input.locale === 'bs';
  return composeAssetReminderEmail({
    ...input,
    recipientKey: 'preview',
    dedupeKey: 'preview:asset.expiring',
    dateLabel: '30.09.2026.',
    lines: [
      { kind: 'warranty', id: 'p1', label: 'INV-00042 · Laptop Dell Latitude 5440', unitName: bs ? 'Sektor IT' : 'IT department', endsAt: '07.10.2026.', daysLeft: 7, path: '/assets' },
      { kind: 'license', id: 'p2', label: 'Microsoft 365 E3', unitName: bs ? 'Direkcija' : 'Headquarters', endsAt: '30.10.2026.', daysLeft: 30, path: '/assets' },
      { kind: 'contract', id: 'p3', label: bs ? 'Održavanje štampača — Primjer d.o.o.' : 'Printer maintenance — Example Ltd', unitName: bs ? 'Direkcija' : 'Headquarters', endsAt: '29.11.2026.', daysLeft: 60, path: '/assets' },
    ],
  });
}
