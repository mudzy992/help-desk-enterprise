import type { EmailLocale } from '../notifications/email/email-template.constants';
import {
  opsAlertAction,
  opsAlertDetailRows,
  opsAlertLabels,
  opsAlertRunbook,
  opsAlertStateLine,
  opsAlertTitle,
  type OpsAlertMessage,
} from './ops-alert-presentation';

export const teamsWebhookTimeoutMs = 5_000;

/**
 * Paket 2.7 (§5.3): one-way post to a Teams "Workflows" webhook as an
 * Adaptive Card (the old Office 365 connectors are retired). No bot and no
 * app registration - the full two-way integration is package 3.1.
 */
export function buildTeamsAlertCard(input: {
  readonly message: OpsAlertMessage;
  readonly locale: EmailLocale;
  readonly appName: string;
  readonly openUrl: string | null;
  readonly now: Date;
}): Record<string, unknown> {
  const { message, locale } = input;
  const text = opsAlertLabels(locale);
  const runbook = opsAlertRunbook(message);
  const critical = message.severity === 'CRITICAL' && message.kind !== 'resolved';
  const body: Array<Record<string, unknown>> = [
    {
      type: 'TextBlock',
      text: `${input.appName}: ${opsAlertTitle(message, locale)}`,
      weight: 'Bolder',
      size: 'Medium',
      wrap: true,
      color: message.kind === 'resolved' ? 'Good' : critical ? 'Attention' : 'Warning',
    },
    { type: 'TextBlock', text: opsAlertStateLine(message, locale, input.now), isSubtle: true, spacing: 'None', wrap: true },
    {
      type: 'FactSet',
      facts: [
        ...opsAlertDetailRows(message, locale).map((row) => ({ title: row.label, value: row.value })),
        { title: text.since, value: message.firstSeenAt.toISOString().replace('T', ' ').slice(0, 16) + ' UTC' },
      ],
    },
    { type: 'TextBlock', text: `**${text.whatToDo}:** ${opsAlertAction(message, locale)}`, wrap: true },
  ];
  if (runbook !== null) body.push({ type: 'TextBlock', text: `${text.runbook}: ${runbook}`, isSubtle: true, wrap: true, size: 'Small' });
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
          body,
          ...(input.openUrl === null
            ? {}
            : { actions: [{ type: 'Action.OpenUrl', title: locale === 'bs' ? 'Otvori zdravlje sistema' : 'Open system health', url: input.openUrl }] }),
        },
      },
    ],
  };
}

export type TeamsPoster = (url: string, payload: unknown) => Promise<void>;

export const postTeamsWebhook: TeamsPoster = async (url, payload) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), teamsWebhookTimeoutMs);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
      redirect: 'error',
    });
    if (!response.ok) throw new Error(`Teams webhook HTTP ${response.status}`);
  } finally {
    clearTimeout(timer);
  }
};
