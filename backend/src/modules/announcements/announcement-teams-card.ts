import type { EmailLocale } from '../notifications/email/email-template.constants';
import {
  announcementMarkdownToText,
  announcementSeverityLabel,
  formatAnnouncementPeriod,
  type AnnouncementEmailFacts,
} from './compose-announcement-email';

/** Teams renders at most a few thousand characters per block comfortably. */
export const announcementTeamsBodyMax = 1500;

const severityColor = { INFO: 'Accent', WARNING: 'Warning', CRITICAL: 'Attention' } as const;

/**
 * Paket 2.9 (K2b): one-way Adaptive Card for a Teams "Workflows" webhook, the
 * same mechanism as the operational alarms (2.7). The channel sees the card
 * regardless of the announcement audience, so only the author's explicit
 * "post to Teams" choice sends it. The full two-way integration is package 3.1.
 */
export function buildAnnouncementTeamsCard(input: {
  readonly announcement: AnnouncementEmailFacts & { readonly serviceName: string | null };
  readonly locale: EmailLocale;
  readonly timeZone: string;
  readonly appName: string;
  readonly openUrl: string | null;
}): Record<string, unknown> {
  const { announcement, locale } = input;
  const bs = locale === 'bs';
  const text = announcementMarkdownToText(announcement.body);
  const body = text.length <= announcementTeamsBodyMax ? text : `${text.slice(0, announcementTeamsBodyMax - 1).trimEnd()}…`;
  const facts = [
    { title: bs ? 'Važnost' : 'Severity', value: announcementSeverityLabel(announcement.severity, locale) },
    {
      title: bs ? 'Vrijedi' : 'Valid',
      value: formatAnnouncementPeriod(announcement.startsAt, announcement.endsAt, locale, input.timeZone),
    },
    ...(announcement.serviceName === null ? [] : [{ title: bs ? 'Usluga' : 'Service', value: announcement.serviceName }]),
  ];
  return {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        contentUrl: null,
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.4',
          msteams: { width: 'Full' },
          body: [
            {
              type: 'TextBlock',
              text: `${input.appName}: ${announcement.title}`,
              weight: 'Bolder',
              size: 'Medium',
              wrap: true,
              color: severityColor[announcement.severity],
            },
            { type: 'FactSet', facts },
            { type: 'TextBlock', text: body, wrap: true },
          ],
          ...(input.openUrl === null
            ? {}
            : { actions: [{ type: 'Action.OpenUrl', title: bs ? 'Otvori najavu' : 'Open announcement', url: input.openUrl }] }),
        },
      },
    ],
  };
}
