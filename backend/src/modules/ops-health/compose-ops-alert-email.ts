import { createHash } from 'node:crypto';
import type { EmailLocale } from '../notifications/email/email-template.constants';
import type { EmailTemplateRegistry } from '../notifications/email/email-template.types';
import type { EmailChannelConfiguration } from '../notifications/email/load-email-channel-configuration';
import { renderEmailMessage } from '../notifications/email/render-email-message';
import {
  opsAlertAction,
  opsAlertColor,
  opsAlertDetailRows,
  opsAlertLabels,
  opsAlertRunbook,
  opsAlertStateLine,
  opsAlertTitle,
  type OpsAlertMessage,
} from './ops-alert-presentation';

export const opsHealthPath = '/admin?tab=ops';

export type ComposedOpsAlertEmail = {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
  readonly messageId: string;
  readonly headers: Readonly<Record<string, string>>;
};

/**
 * Paket 2.7 (§5.3): template `ops.alert`. `reportName` is the alarm title and
 * `reportPeriod` the severity/state line. The header line takes the severity
 * colour unless an administrator set an explicit colour on the template.
 */
export function composeOpsAlertEmail(input: {
  readonly configuration: EmailChannelConfiguration;
  readonly templates?: EmailTemplateRegistry;
  readonly locale: EmailLocale;
  readonly recipientKey: string;
  readonly recipientName: string;
  readonly message: OpsAlertMessage;
  readonly dedupeKey: string;
  readonly now: Date;
}): ComposedOpsAlertEmail {
  const presentation = input.configuration.presentation;
  const templates = input.templates ?? input.configuration.templates;
  const template = templates[input.locale]['ops.alert'];
  const text = opsAlertLabels(input.locale);
  const rows = opsAlertDetailRows(input.message, input.locale);
  const runbook = opsAlertRunbook(input.message);
  const rendered = renderEmailMessage({
    template: template.accentColor.trim().length > 0 ? template : { ...template, accentColor: opsAlertColor(input.message) },
    locale: input.locale,
    variables: {
      recipientName: input.recipientName,
      appName: presentation.appName,
      reportName: opsAlertTitle(input.message, input.locale),
      reportPeriod: opsAlertStateLine(input.message, input.locale, input.now),
    },
    appName: presentation.appName,
    brand: presentation.brand,
    accentColor: presentation.accentColor,
    confidential: false,
    ticket: null,
    excerpt: null,
    ctaUrl: presentation.publicUrl === null ? null : `${presentation.publicUrl}${opsHealthPath}`,
    replyMode: 'no_reply',
    manageUrl: null,
    report: {
      tables:
        rows.length === 0
          ? []
          : [{ title: text.detailsTitle, columns: text.columns, rows: rows.map((row) => ({ cells: [row.label, row.value] })) }],
      notes: [
        `${text.whatToDo}: ${opsAlertAction(input.message, input.locale)}`,
        ...(runbook === null ? [] : [`${text.runbook}: ${runbook}`]),
      ],
      footerReason: text.footer,
    },
  });
  const domain = mailDomain(input.configuration.smtp?.fromAddress);
  return {
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    messageId: `<${createHash('sha256').update(`${input.dedupeKey}:${input.recipientKey}`).digest('hex').slice(0, 32)}@${domain}>`,
    headers: { 'Auto-Submitted': 'auto-generated', 'X-Auto-Response-Suppress': 'All', 'X-Priority': input.message.severity === 'CRITICAL' && input.message.kind !== 'resolved' ? '1' : '3' },
  };
}

/** Editor preview: a disk warning with realistic numbers (same code path). */
export function composeOpsAlertEmailPreview(input: {
  readonly configuration: EmailChannelConfiguration;
  readonly templates: EmailTemplateRegistry;
  readonly locale: EmailLocale;
  readonly recipientName: string;
}): ComposedOpsAlertEmail {
  const now = new Date();
  return composeOpsAlertEmail({
    ...input,
    recipientKey: 'preview',
    dedupeKey: 'preview:ops.alert',
    now,
    message: {
      key: 'disk.usage',
      severity: 'WARNING',
      kind: 'opened',
      details: { usedPercent: 83.4, freeGb: 16.6, totalGb: 100 },
      firstSeenAt: new Date(now.getTime() - 2 * 60_000),
      resolvedAt: null,
    },
  });
}

function mailDomain(fromAddress: string | undefined): string {
  const domain = (fromAddress ?? '').split('@')[1]?.trim().toLowerCase() ?? '';
  return /^[a-z0-9.-]+$/.test(domain) && domain.length > 0 ? domain : 'service-desk.invalid';
}
