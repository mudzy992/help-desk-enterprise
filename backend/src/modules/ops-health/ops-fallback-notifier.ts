import { defaultAppName } from '../branding/branding.constants';
import { createTransport } from 'nodemailer';
import {
  opsAlertAction,
  opsAlertDetailRows,
  opsAlertStateLine,
  opsAlertTitle,
  type OpsAlertMessage,
} from './ops-alert-presentation';
import { buildTeamsAlertCard, postTeamsWebhook, type TeamsPoster } from './teams-webhook';

/**
 * Paket 2.7 (§5.3): when the database or Redis is down the regular channels
 * cannot work (recipients and settings live in the database). The worker then
 * uses only environment variables, deduplicated in memory: at most one message
 * per alarm key and kind every 30 minutes.
 *
 * Env: OPS_ALERT_SMTP_URL (smtp[s]://user:pass@host:port), OPS_ALERT_EMAIL_TO
 * (comma-separated), OPS_ALERT_EMAIL_FROM (optional), OPS_ALERT_TEAMS_WEBHOOK_URL.
 */
export type FallbackConfiguration = {
  readonly smtpUrl: string | null;
  readonly emailTo: readonly string[];
  readonly emailFrom: string;
  readonly teamsWebhookUrl: string | null;
};

export const fallbackDedupeMs = 30 * 60_000;

export function readFallbackConfiguration(env: NodeJS.ProcessEnv = process.env): FallbackConfiguration {
  const smtpUrl = env.OPS_ALERT_SMTP_URL?.trim() ?? '';
  const teams = env.OPS_ALERT_TEAMS_WEBHOOK_URL?.trim() ?? '';
  const emailTo = (env.OPS_ALERT_EMAIL_TO ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter((part) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(part));
  return {
    smtpUrl: /^smtps?:\/\//i.test(smtpUrl) ? smtpUrl : null,
    emailTo,
    emailFrom: env.OPS_ALERT_EMAIL_FROM?.trim() || 'service-desk-monitor@localhost',
    teamsWebhookUrl: teams.startsWith('https://') ? teams : null,
  };
}

export function isFallbackConfigured(configuration: FallbackConfiguration): boolean {
  return (configuration.smtpUrl !== null && configuration.emailTo.length > 0) || configuration.teamsWebhookUrl !== null;
}

export type FallbackMailer = (smtpUrl: string, message: { from: string; to: string; subject: string; text: string }) => Promise<void>;

const sendWithNodemailer: FallbackMailer = async (smtpUrl, message) => {
  const transport = createTransport(smtpUrl, { connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000 } as never);
  try {
    await transport.sendMail({ ...message, headers: { 'Auto-Submitted': 'auto-generated' } });
  } finally {
    transport.close();
  }
};

export class OpsFallbackNotifier {
  private readonly sentAt = new Map<string, number>();

  constructor(
    private readonly configuration: FallbackConfiguration = readFallbackConfiguration(),
    private readonly mailer: FallbackMailer = sendWithNodemailer,
    private readonly teams: TeamsPoster = postTeamsWebhook,
    private readonly now: () => number = Date.now,
  ) {}

  isConfigured(): boolean {
    return isFallbackConfigured(this.configuration);
  }

  /** Returns the channels that accepted the message; never throws. */
  async notify(message: OpsAlertMessage): Promise<string[]> {
    if (!this.isConfigured()) return [];
    const dedupe = `${message.key}:${message.kind}`;
    const last = this.sentAt.get(dedupe);
    const now = this.now();
    if (last !== undefined && now - last < fallbackDedupeMs) return [];
    this.sentAt.set(dedupe, now);
    const at = new Date(now);
    const delivered: string[] = [];
    const { smtpUrl, emailTo, emailFrom, teamsWebhookUrl } = this.configuration;
    if (smtpUrl !== null && emailTo.length > 0) {
      const subject = `[${opsAlertStateLine(message, 'bs', at)}] ${opsAlertTitle(message, 'bs')} / ${opsAlertTitle(message, 'en')}`;
      const lines = [
        opsAlertTitle(message, 'bs'),
        opsAlertStateLine(message, 'bs', at),
        '',
        ...opsAlertDetailRows(message, 'bs').map((row) => `${row.label}: ${row.value}`),
        '',
        opsAlertAction(message, 'bs'),
        '',
        '---',
        opsAlertTitle(message, 'en'),
        opsAlertAction(message, 'en'),
        '',
        'Rezervni kanal (OPS_ALERT_SMTP_URL): baza ili Redis nisu dostupni. / Fallback channel: database or Redis unavailable.',
      ];
      try {
        await this.mailer(smtpUrl, { from: emailFrom, to: emailTo.join(', '), subject, text: lines.join('\n') });
        delivered.push('email');
      } catch {
        // Logged by the caller through the returned list; nothing else can be done here.
      }
    }
    if (teamsWebhookUrl !== null) {
      try {
        await this.teams(teamsWebhookUrl, buildTeamsAlertCard({ message, locale: 'bs', appName: defaultAppName, openUrl: null, now: at }));
        delivered.push('teams');
      } catch {
        // See above.
      }
    }
    return delivered;
  }
}
