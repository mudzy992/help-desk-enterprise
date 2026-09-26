import {
  defaultEmailAccentColor,
  emailMessageExcerptMaxLength,
  emailTemplatePlaceholders,
  type EmailLocale,
  type EmailReplyMode,
} from './email-template.constants';
import { emailLayoutLabels } from './email-layout-labels';
import type { EmailTemplateContent, EmailTemplateVariables } from './email-template.types';

export type EmailTicketCard = {
  readonly number: string;
  readonly title: string;
  readonly serviceName: string;
  readonly statusLabel: string;
  readonly priorityLabel: string;
};

export type RenderEmailMessageInput = {
  readonly template: EmailTemplateContent;
  readonly locale: EmailLocale;
  readonly variables: EmailTemplateVariables;
  readonly appName: string;
  readonly accentColor: string;
  /** Decision E3: number and link only. */
  readonly confidential: boolean;
  /** Ticket e-mails get the card, the `[number]` subject prefix and the reason footer. */
  readonly ticket: EmailTicketCard | null;
  /** Decision E4: public reply text, already redacted. */
  readonly excerpt: string | null;
  readonly ctaUrl: string | null;
  readonly replyMode: EmailReplyMode;
  /** Paket 2.2: footer link to `/account/notifications` (null = no link). */
  readonly manageUrl?: string | null;
  /** Paket 2.2: the ticket list of a digest e-mail. */
  readonly digest?: EmailDigestList | null;
};

export type EmailDigestRow = {
  readonly ticketNumber: string;
  /** Empty for confidential tickets (number only, decision E3). */
  readonly title: string;
  readonly statusLabel: string;
  readonly eventLabel: string;
  readonly eventCount: number;
  readonly url: string | null;
};

export type EmailDigestList = {
  readonly rows: readonly EmailDigestRow[];
  /** "and N more …" line, already localized. */
  readonly more: string | null;
};

export type RenderedEmailMessage = {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
};

const placeholderPattern = /\{\{\s*([a-zA-Z][a-zA-Z0-9]*)\s*\}\}/g;
const allowedPlaceholders = new Set<string>(emailTemplatePlaceholders);
const fontStack = "'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/**
 * Renders one e-mail: a fixed, table-based HTML layout (Outlook desktop, OWA,
 * Gmail, mobile) plus a plain-text alternative from the same data. Every
 * variable is escaped; the subject cannot carry line breaks.
 */
export function renderEmailMessage(input: RenderEmailMessageInput): RenderedEmailMessage {
  const labels = emailLayoutLabels[input.locale];
  const confidential = input.confidential;
  const variables: EmailTemplateVariables = confidential
    ? {
        ...input.variables,
        ticketTitle: input.ticket?.number ?? '',
        serviceName: '',
        groupName: '',
        ticketDescription: '',
        ticketDescriptionShort: '',
      }
    : input.variables;
  const fill = (source: string) => interpolate(source, variables);
  const rawSubject = fill(
    confidential ? input.template.subjectConfidential : input.template.subject,
  );
  const subject = singleLine(
    input.ticket !== null && !rawSubject.includes(input.ticket.number)
      ? `[${input.ticket.number}] ${rawSubject}`
      : rawSubject,
  );
  const heading = fill(input.template.heading);
  const body = fill(input.template.body);
  const cta = fill(input.template.cta);
  const footer = fill(input.template.footer);
  // A full description may be long; the body keeps its paragraphs either way.
  const excerpt = confidential || input.excerpt === null ? null : truncate(input.excerpt);
  const ctaUrl = safeUrl(input.ctaUrl);
  const manageUrl = safeUrl(input.manageUrl ?? null);
  const footerNote =
    input.replyMode === 'shared_mailbox' ? labels.footerReply : labels.footerNoReply;
  const rows: [string, string][] =
    input.ticket === null
      ? []
      : confidential
        ? [[labels.ticket, input.ticket.number]]
        : ([
            [labels.ticket, input.ticket.number],
            [labels.title, input.ticket.title],
            [labels.service, input.ticket.serviceName],
            [labels.status, input.ticket.statusLabel],
            [labels.priority, input.ticket.priorityLabel],
          ].filter(([, value]) => value.trim().length > 0) as [string, string][]);

  const text = [
    heading,
    '',
    body,
    ...(confidential ? ['', `[${labels.confidential}]`] : []),
    ...(rows.length > 0 ? ['', ...rows.map(([label, value]) => `${label}: ${value}`)] : []),
    ...(excerpt === null ? [] : ['', `${labels.message}:`, quote(excerpt)]),
    ...digestText(input.digest ?? null, labels.digestEventCount),
    ...(ctaUrl === null ? [] : ['', `${cta}: ${ctaUrl}`]),
    ...(footer.trim().length > 0 ? ['', footer] : []),
    '',
    '—',
    input.appName,
    ...(input.ticket === null ? [] : [labels.footerReason]),
    ...(input.digest ? [labels.digestFooterReason] : []),
    footerNote,
    ...(manageUrl === null ? [] : [`${labels.manageNotifications}: ${manageUrl}`]),
  ].join('\n');

  const accent = resolveAccent(
    input.template.accentColor.trim().length > 0 ? input.template.accentColor : input.accentColor,
  );
  const html = renderHtml({
    locale: input.locale,
    subject,
    appName: input.appName,
    heading,
    body,
    confidentialLabel: confidential ? labels.confidential : null,
    rows,
    excerptLabel: labels.message,
    excerpt,
    cta,
    ctaUrl,
    linkFallback: labels.linkFallback,
    footer,
    footerReason:
      input.ticket !== null ? labels.footerReason : input.digest ? labels.digestFooterReason : null,
    footerNote,
    accent,
    digestHtml: digestHtml(input.digest ?? null, labels.digestEventCount),
    manageLabel: labels.manageNotifications,
    manageUrl,
  });
  return { subject, html, text };
}

function renderHtml(view: {
  readonly locale: string;
  readonly subject: string;
  readonly appName: string;
  readonly heading: string;
  readonly body: string;
  readonly confidentialLabel: string | null;
  readonly rows: readonly [string, string][];
  readonly excerptLabel: string;
  readonly excerpt: string | null;
  readonly cta: string;
  readonly ctaUrl: string | null;
  readonly linkFallback: string;
  readonly footer: string;
  readonly footerReason: string | null;
  readonly footerNote: string;
  readonly accent: { readonly background: string; readonly foreground: string };
  readonly digestHtml: string;
  readonly manageLabel: string;
  readonly manageUrl: string | null;
}): string {
  const e = escapeHtml;
  const cardRows = view.rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 0;width:110px;color:#6b7280;font-size:13px;vertical-align:top;">${e(label)}</td>` +
        `<td style="padding:6px 0;color:#111827;font-size:13px;font-weight:600;">${e(value)}</td></tr>`,
    )
    .join('');
  const badge =
    view.confidentialLabel === null
      ? ''
      : `<p style="margin:0 0 16px;"><span style="display:inline-block;padding:3px 10px;border-radius:999px;background:#fef2f2;color:#991b1b;font-size:12px;font-weight:600;border:1px solid #fecaca;">${e(view.confidentialLabel)}</span></p>`;
  const card =
    cardRows.length === 0
      ? ''
      : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border:1px solid #e5e7eb;border-radius:8px;"><tr><td style="padding:12px 16px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${cardRows}</table></td></tr></table>`;
  const excerpt =
    view.excerpt === null
      ? ''
      : `<p style="margin:20px 0 6px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:.06em;">${e(view.excerptLabel)}</p>` +
        `<div style="margin:0;padding:12px 16px;border-left:3px solid ${view.accent.background};background:#f9fafb;color:#111827;font-size:14px;line-height:1.55;">${paragraphs(view.excerpt)}</div>`;
  const button =
    view.ctaUrl === null
      ? ''
      : `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px;"><tr><td>` +
        `<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${e(view.ctaUrl)}" style="height:40px;v-text-anchor:middle;width:220px;" arcsize="15%" stroke="f" fillcolor="${view.accent.background}"><center style="color:${view.accent.foreground};font-family:Segoe UI,Arial,sans-serif;font-size:14px;font-weight:bold;">${e(view.cta)}</center></v:roundrect><![endif]-->` +
        `<!--[if !mso]><!--><a href="${e(view.ctaUrl)}" style="display:inline-block;padding:11px 22px;border-radius:6px;background:${view.accent.background};color:${view.accent.foreground};font-size:14px;font-weight:600;text-decoration:none;">${e(view.cta)}</a><!--<![endif]-->` +
        `</td></tr></table>` +
        `<p style="margin:8px 0 0;color:#6b7280;font-size:12px;line-height:1.5;">${e(view.linkFallback)}<br><a href="${e(view.ctaUrl)}" style="color:#374151;word-break:break-all;">${e(view.ctaUrl)}</a></p>`;
  const footer =
    view.footer.trim().length === 0
      ? ''
      : `<div style="margin:20px 0 0;color:#374151;font-size:13px;line-height:1.55;">${paragraphs(view.footer)}</div>`;
  return (
    `<!DOCTYPE html><html lang="${e(view.locale)}" xmlns:v="urn:schemas-microsoft-com:vml"><head>` +
    `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light">` +
    `<title>${e(view.subject)}</title></head>` +
    `<body style="margin:0;padding:0;background:#f3f4f6;font-family:${fontStack};">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;"><tr><td align="center" style="padding:24px 12px;">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:10px;border:1px solid #e5e7eb;">` +
    `<tr><td style="padding:18px 28px;border-bottom:3px solid ${view.accent.background};font-size:16px;font-weight:700;color:#111827;">${e(view.appName)}</td></tr>` +
    `<tr><td style="padding:28px;">` +
    badge +
    `<h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;color:#111827;">${e(view.heading)}</h1>` +
    `<div style="color:#374151;font-size:14px;line-height:1.6;">${paragraphs(view.body)}</div>` +
    card +
    excerpt +
    view.digestHtml +
    button +
    footer +
    `</td></tr>` +
    `<tr><td style="padding:16px 28px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.5;">` +
    (view.footerReason === null ? '' : `${e(view.footerReason)}<br>`) +
    `${e(view.footerNote)}` +
    (view.manageUrl === null
      ? ''
      : `<br><a href="${e(view.manageUrl)}" style="color:#374151;">${e(view.manageLabel)}</a>`) +
    `</td></tr>` +
    `</table></td></tr></table></body></html>`
  );
}

function digestText(digest: EmailDigestList | null, countLabel: string): string[] {
  if (digest === null || digest.rows.length === 0) {
    return [];
  }
  const lines = digest.rows.map((row) => {
    const title = row.title.trim().length > 0 ? ` ${row.title}` : '';
    const count = row.eventCount > 1 ? ` (${countLabel.replace('{count}', String(row.eventCount))})` : '';
    const url = row.url === null ? '' : `\n  ${row.url}`;
    return `- [${row.ticketNumber}]${title} — ${row.eventLabel}, ${row.statusLabel}${count}${url}`;
  });
  return ['', ...lines, ...(digest.more === null ? [] : ['', digest.more])];
}

function digestHtml(digest: EmailDigestList | null, countLabel: string): string {
  if (digest === null || digest.rows.length === 0) {
    return '';
  }
  const e = escapeHtml;
  const rows = digest.rows
    .map((row) => {
      const safe = safeUrl(row.url);
      const number = safe === null
        ? e(row.ticketNumber)
        : `<a href="${e(safe)}" style="color:#111827;font-weight:600;text-decoration:none;">${e(row.ticketNumber)}</a>`;
      const count = row.eventCount > 1 ? ` · ${e(countLabel.replace('{count}', String(row.eventCount)))}` : '';
      const title = row.title.trim().length > 0
        ? `<div style="color:#111827;font-size:13px;margin-top:2px;">${e(row.title)}</div>`
        : '';
      return (
        `<tr><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;vertical-align:top;">` +
        `<div style="font-size:13px;">${number}</div>${title}` +
        `<div style="color:#6b7280;font-size:12px;margin-top:2px;">${e(row.eventLabel)} · ${e(row.statusLabel)}${count}</div>` +
        `</td></tr>`
      );
    })
    .join('');
  const more = digest.more === null
    ? ''
    : `<p style="margin:12px 0 0;color:#6b7280;font-size:13px;">${e(digest.more)}</p>`;
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 0;">${rows}</table>` +
    more
  );
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function paragraphs(value: string): string {
  return value
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .map(
      (block, index) =>
        `<p style="margin:${index === 0 ? '0' : '12px'} 0 0;">${escapeHtml(block).replace(/\n/g, '<br>')}</p>`,
    )
    .join('');
}

function interpolate(source: string, variables: EmailTemplateVariables): string {
  return source.replace(placeholderPattern, (_match, name: string) =>
    allowedPlaceholders.has(name)
      ? sanitize(variables[name as keyof EmailTemplateVariables])
      : '',
  );
}

function sanitize(value: string | undefined): string {
  if (value === undefined) {
    return '';
  }
  // eslint-disable-next-line no-control-regex -- stripping control characters is the point
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
}

/** Header injection guard: a subject is always one line. */
function singleLine(value: string): string {
  return value.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, 250);
}

function truncate(value: string): string {
  const normalized = value.replace(/\r\n/g, '\n').trim();
  return normalized.length <= emailMessageExcerptMaxLength
    ? normalized
    : `${normalized.slice(0, emailMessageExcerptMaxLength - 1).trimEnd()}…`;
}

function quote(value: string): string {
  return value
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
}

/** Only absolute http(s) URLs from configuration end up in an e-mail. */
function safeUrl(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Accent from settings; the button text switches to dark when white would fail AA. */
export function resolveAccent(value: string): { background: string; foreground: string } {
  const background = /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : defaultEmailAccentColor;
  const white = contrastRatio(background, '#ffffff');
  return { background, foreground: white >= 4.5 ? '#ffffff' : '#111827' };
}

function contrastRatio(left: string, right: string): number {
  const [a, b] = [luminance(left), luminance(right)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
  const [r, g, b] = channels.map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}
