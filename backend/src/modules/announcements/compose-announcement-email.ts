import { createHash } from 'node:crypto';
import type { EmailLocale } from '../notifications/email/email-template.constants';
import type { EmailTemplateRegistry } from '../notifications/email/email-template.types';
import type { EmailChannelConfiguration } from '../notifications/email/load-email-channel-configuration';
import { renderEmailMessage } from '../notifications/email/render-email-message';

export type AnnouncementEmailKind = 'PUBLISHED' | 'REMINDER';
export type AnnouncementSeverityValue = 'INFO' | 'WARNING' | 'CRITICAL';

export type AnnouncementEmailFacts = {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly severity: AnnouncementSeverityValue;
  readonly startsAt: Date;
  readonly endsAt: Date;
};

export type ComposedAnnouncementEmail = {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
  readonly messageId: string;
  readonly headers: Readonly<Record<string, string>>;
};

/** Where the CTA points: the announcement archive opens the item. */
export const announcementPath = (id: string) => `/announcements?open=${encodeURIComponent(id)}`;

const severityColor: Record<AnnouncementSeverityValue, string> = {
  INFO: '#2563eb',
  WARNING: '#b45309',
  CRITICAL: '#dc2626',
};

const severityLabels: Record<EmailLocale, Record<AnnouncementSeverityValue, string>> = {
  bs: { INFO: 'Informacija', WARNING: 'Upozorenje', CRITICAL: 'Kritično' },
  en: { INFO: 'Information', WARNING: 'Warning', CRITICAL: 'Critical' },
};

const footerReason: Record<EmailLocale, Record<AnnouncementEmailKind, string>> = {
  bs: {
    PUBLISHED: 'Ovu poruku primate jer ste u publici najave za koju je autor tražio i obavijest e-mailom.',
    REMINDER: 'Ovu poruku primate jer najava traži potvrdu čitanja, a vaša potvrda još nije zabilježena.',
  },
  en: {
    PUBLISHED: 'You receive this because you are in the audience of an announcement whose author asked for an e-mail notice.',
    REMINDER: 'You receive this because the announcement asks for a read acknowledgement and yours has not been recorded yet.',
  },
};

export function announcementSeverityLabel(severity: AnnouncementSeverityValue, locale: EmailLocale): string {
  return severityLabels[locale][severity];
}

/** "1. 10. 2026. 08:00 – 3. 10. 2026. 16:00" in the installation time zone. */
export function formatAnnouncementPeriod(startsAt: Date, endsAt: Date, locale: EmailLocale, timeZone: string): string {
  const format = (date: Date) => {
    try {
      return new Intl.DateTimeFormat(locale === 'bs' ? 'bs-BA' : 'en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone,
      }).format(date);
    } catch {
      return `${date.toISOString().replace('T', ' ').slice(0, 16)} UTC`;
    }
  };
  return `${format(startsAt)} – ${format(endsAt)}`;
}

/**
 * The announcement body is the Markdown subset of the privacy notice. E-mail
 * gets readable plain text (the renderer escapes it and keeps paragraphs):
 * markers are dropped, links become "text (url)", list items get a bullet.
 * Only http(s)/mailto link targets are kept, as in the in-app renderer.
 */
export function announcementMarkdownToText(source: string): string {
  const escapes: string[] = [];
  const protectedSource = source
    .replace(/\r\n?/g, '\n')
    .replace(/\\([\\`*_[\]()<>#|+\-.!~])/g, (_match, char: string) => {
      escapes.push(char);
      return `\uE000${escapes.length - 1}\uE000`;
    });
  const lines = protectedSource.split('\n').map((line) => {
    let text = line
      .replace(/^\s{0,3}#{1,3}\s+/, '')
      .replace(/^\s{0,3}>\s?/, '')
      .replace(/^\s*[-*]\s+/, '• ');
    text = text
      .replace(/\[([^\]]*)\]\(([^)\s]*)\)/g, (_match, label: string, url: string) =>
        /^(https?:\/\/|mailto:)/i.test(url) ? (label.trim().length === 0 ? url : `${label} (${url})`) : label,
      )
      .replace(/`([^`]*)`/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/(^|[^\w*])\*([^*\s][^*]*)\*/g, '$1$2')
      .replace(/(^|[^\w])_([^_\s][^_]*)_/g, '$1$2');
    return text.trimEnd();
  });
  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .replace(/\uE000(\d+)\uE000/g, (_match, index: string) => escapes[Number(index)] ?? '');
}

/**
 * Paket 2.9 (K2b): templates `announcement.published` / `announcement.reminder`.
 * No ticket card; the header line takes the severity colour unless an
 * administrator set an explicit colour on the template.
 */
export function composeAnnouncementEmail(input: {
  readonly configuration: EmailChannelConfiguration;
  readonly templates?: EmailTemplateRegistry;
  readonly locale: EmailLocale;
  readonly timeZone: string;
  readonly kind: AnnouncementEmailKind;
  readonly recipientKey: string;
  readonly recipientName: string;
  readonly announcement: AnnouncementEmailFacts;
  readonly dedupeKey: string;
}): ComposedAnnouncementEmail {
  const presentation = input.configuration.presentation;
  const templates = input.templates ?? input.configuration.templates;
  const key = input.kind === 'PUBLISHED' ? 'announcement.published' : 'announcement.reminder';
  const template = templates[input.locale][key];
  const { announcement } = input;
  const rendered = renderEmailMessage({
    template:
      template.accentColor.trim().length > 0 ? template : { ...template, accentColor: severityColor[announcement.severity] },
    locale: input.locale,
    variables: {
      recipientName: input.recipientName,
      appName: presentation.appName,
      announcementTitle: announcement.title,
      announcementBody: announcementMarkdownToText(announcement.body),
      announcementSeverity: announcementSeverityLabel(announcement.severity, input.locale),
      announcementPeriod: formatAnnouncementPeriod(announcement.startsAt, announcement.endsAt, input.locale, input.timeZone),
    },
    appName: presentation.appName,
    accentColor: presentation.accentColor,
    confidential: false,
    ticket: null,
    excerpt: null,
    ctaUrl: presentation.publicUrl === null ? null : `${presentation.publicUrl}${announcementPath(announcement.id)}`,
    replyMode: 'no_reply',
    manageUrl: presentation.publicUrl === null ? null : `${presentation.publicUrl}/account/notifications`,
    report: { tables: [], notes: [], footerReason: footerReason[input.locale][input.kind] },
  });
  const domain = mailDomain(input.configuration.smtp?.fromAddress);
  return {
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    messageId: `<${createHash('sha256').update(`${input.dedupeKey}:${input.recipientKey}`).digest('hex').slice(0, 32)}@${domain}>`,
    headers: {
      'Auto-Submitted': 'auto-generated',
      'X-Auto-Response-Suppress': 'All',
      Precedence: 'bulk',
      'X-Priority': announcement.severity === 'CRITICAL' ? '1' : '3',
    },
  };
}

/** Editor preview: a realistic planned outage (same code path). */
export function composeAnnouncementEmailPreview(input: {
  readonly configuration: EmailChannelConfiguration;
  readonly templates: EmailTemplateRegistry;
  readonly locale: EmailLocale;
  readonly recipientName: string;
  readonly kind: AnnouncementEmailKind;
}): ComposedAnnouncementEmail {
  const startsAt = new Date(Date.now() + 86_400_000);
  const bs = input.locale === 'bs';
  return composeAnnouncementEmail({
    ...input,
    timeZone: 'Europe/Sarajevo',
    recipientKey: 'preview',
    dedupeKey: `preview:announcement:${input.kind}`,
    announcement: {
      id: 'preview',
      title: bs ? 'Planirano održavanje e-mail sistema' : 'Planned e-mail system maintenance',
      body: bs
        ? 'U subotu od **08:00 do 12:00** e-mail neće biti dostupan.\n\n- Poruke poslane u tom periodu stižu nakon završetka.\n- Hitne zahtjeve prijavite telefonom.'
        : 'On Saturday from **08:00 to 12:00** e-mail will be unavailable.\n\n- Messages sent in that window arrive afterwards.\n- Report urgent requests by phone.',
      severity: 'WARNING',
      startsAt,
      endsAt: new Date(startsAt.getTime() + 4 * 3_600_000),
    },
  });
}

function mailDomain(fromAddress: string | undefined): string {
  const domain = (fromAddress ?? '').split('@')[1]?.trim().toLowerCase() ?? '';
  return /^[a-z0-9.-]+$/.test(domain) && domain.length > 0 ? domain : 'ephelpdesk.local';
}
