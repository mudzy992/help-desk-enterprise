import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { permissionKeys } from '../authorization/authorization.constants';
import { resolveEmailLocale } from '../notifications/email/compose-ticket-email';
import { deliverNotificationEmail } from '../notifications/email/deliver-notification-email';
import { loadEmailChannelConfiguration, type EmailChannelConfiguration } from '../notifications/email/load-email-channel-configuration';
import { MAIL_TRANSPORT, type MailTransport } from '../notifications/email/mail-transport';
import { persistInAppNotification } from '../notifications/fan-out/persist-in-app-notification';
import { notificationTypes } from '../notifications/notifications.constants';
import { SettingsService } from '../settings/settings.service';
import { composeOpsAlertEmail, opsHealthPath } from './compose-ops-alert-email';
import type { OpsConfiguration } from './ops-configuration.loader';
import { opsAlertStateLine, opsAlertTitle, type OpsAlertMessage } from './ops-alert-presentation';
import { buildTeamsAlertCard, postTeamsWebhook, type TeamsPoster } from './teams-webhook';

export const OPS_TEAMS_POSTER = Symbol('OPS_TEAMS_POSTER');

export type OpsChannel = 'email' | 'inApp' | 'teams';
export type OpsChannelResult = {
  readonly channel: OpsChannel;
  readonly status: 'sent' | 'partial' | 'failed' | 'skipped';
  readonly delivered: number;
  readonly failed: number;
  /** Technical reason for skipped/failed (never a secret or an address). */
  readonly reason: string | null;
};

type Recipient = { readonly id: string; readonly email: string; readonly displayName: string; readonly preferredLocale: string | null };

/** More would mean the permission was granted too widely; the cap protects SMTP. */
const maxRecipients = 50;

/**
 * Paket 2.7 (§5.3): delivers one alarm event to every regular channel -
 * e-mail (holders of `ops.alerts.receive` + extra addresses), in-app and the
 * optional Teams webhook. A failing channel never stops the others and never
 * throws into the health check; the result per channel feeds the "send test"
 * button and the logs.
 */
@Injectable()
export class OpsAlertNotifier {
  private readonly logger = new Logger(OpsAlertNotifier.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    @Inject(MAIL_TRANSPORT) private readonly mailTransport: MailTransport,
    @Inject(OPS_TEAMS_POSTER) private readonly teams: TeamsPoster = postTeamsWebhook,
  ) {}

  async notify(input: {
    readonly message: OpsAlertMessage;
    readonly configuration: OpsConfiguration;
    /** Unique per alarm event, e.g. `ops-alert:<id>:opened:1`. */
    readonly dedupeKey: string;
    readonly alertId: string | null;
    readonly now?: Date;
  }): Promise<OpsChannelResult[]> {
    const now = input.now ?? new Date();
    const recipients = await this.recipients().catch((error: unknown) => {
      this.logger.warn(`ops_alert_recipients_failed reason=${errorText(error)}`);
      return [] as Recipient[];
    });
    const channel = await loadEmailChannelConfiguration(this.settingsService).catch(() => null);
    const results = await Promise.all([
      this.sendEmail(input, recipients, channel, now),
      this.sendInApp(input, recipients),
      this.sendTeams(input, channel, now),
    ]);
    for (const result of results) {
      if (result.status === 'failed' || result.status === 'partial') {
        this.logger.warn(
          `ops_alert_channel_failed channel=${result.channel} key=${input.message.key} failed=${result.failed} reason=${result.reason ?? '-'}`,
        );
      }
    }
    return results;
  }

  private async recipients(): Promise<Recipient[]> {
    return this.prisma.user.findMany({
      where: {
        isActive: true,
        anonymizedAt: null,
        userRoles: { some: { role: { rolePermissions: { some: { permission: { key: permissionKeys.opsAlertsReceive } } } } } },
      },
      select: { id: true, email: true, displayName: true, preferredLocale: true },
      orderBy: { id: 'asc' },
      take: maxRecipients,
    });
  }

  private async sendEmail(
    input: Parameters<OpsAlertNotifier['notify']>[0],
    recipients: readonly Recipient[],
    channel: EmailChannelConfiguration | null,
    now: Date,
  ): Promise<OpsChannelResult> {
    if (channel === null || !channel.deliveryEnabled || channel.smtp === null) {
      return result('email', 0, 0, 'email_channel_disabled');
    }
    const userAddresses = new Set(recipients.map((user) => user.email.toLowerCase()));
    const extras = input.configuration.extraRecipients.filter((address) => !userAddresses.has(address));
    if (recipients.length === 0 && extras.length === 0) return result('email', 0, 0, 'no_recipients');
    let delivered = 0;
    let failed = 0;
    let lastError: string | null = null;
    for (const user of recipients) {
      const locale = resolveEmailLocale(user.preferredLocale, channel);
      const composed = composeOpsAlertEmail({
        configuration: channel,
        locale,
        recipientKey: user.id,
        recipientName: user.displayName,
        message: input.message,
        dedupeKey: input.dedupeKey,
        now,
      });
      try {
        await deliverNotificationEmail(this.prisma, this.mailTransport, channel, {
          userId: user.id,
          toAddress: user.email,
          dedupeKey: input.dedupeKey,
          templateKey: 'ops.alert',
          subject: composed.subject,
          text: composed.text,
          html: composed.html,
          messageId: composed.messageId,
          headers: composed.headers,
        });
        delivered += 1;
      } catch (error) {
        failed += 1;
        lastError = errorText(error);
      }
    }
    // Extra addresses have no user row, so no delivery ledger: the engine
    // already sends each alarm event exactly once.
    for (const address of extras) {
      const locale = resolveEmailLocale(null, channel);
      const composed = composeOpsAlertEmail({
        configuration: channel,
        locale,
        recipientKey: address,
        recipientName: locale === 'bs' ? 'dežurni' : 'on-call',
        message: input.message,
        dedupeKey: input.dedupeKey,
        now,
      });
      try {
        await this.mailTransport.send(
          {
            from: channel.smtp.fromAddress,
            to: address,
            subject: composed.subject,
            text: composed.text,
            html: composed.html,
            messageId: composed.messageId,
            headers: composed.headers,
          },
          channel.smtp,
        );
        delivered += 1;
      } catch (error) {
        failed += 1;
        lastError = errorText(error);
      }
    }
    return result('email', delivered, failed, lastError);
  }

  private async sendInApp(input: Parameters<OpsAlertNotifier['notify']>[0], recipients: readonly Recipient[]): Promise<OpsChannelResult> {
    if (recipients.length === 0) return result('inApp', 0, 0, 'no_recipients');
    let delivered = 0;
    let failed = 0;
    let lastError: string | null = null;
    const { message } = input;
    for (const user of recipients) {
      try {
        await persistInAppNotification(this.prisma, {
          userId: user.id,
          type: notificationTypes.opsAlert,
          title: 'notifications.items.opsAlert',
          // Readable in the list as-is; structured fields stay in the payload.
          body: `${opsAlertTitle(message, 'bs')} — ${opsAlertStateLine(message, 'bs', input.now ?? new Date())}`,
          ticketId: null,
          payload: {
            ticketId: '',
            ticketNumber: '',
            event: notificationTypes.opsAlert,
            messageId: input.dedupeKey,
            actorUserId: null,
            confidential: false,
            alertId: input.alertId,
            alertKey: message.key,
            severity: message.severity,
            kind: message.kind,
            // Fallback text for clients that do not know the key yet.
            title: opsAlertTitle(message, 'en'),
          } as never,
          dedupeKey: `${input.dedupeKey}:${user.id}`,
        });
        delivered += 1;
      } catch (error) {
        failed += 1;
        lastError = errorText(error);
      }
    }
    return result('inApp', delivered, failed, lastError);
  }

  private async sendTeams(
    input: Parameters<OpsAlertNotifier['notify']>[0],
    channel: EmailChannelConfiguration | null,
    now: Date,
  ): Promise<OpsChannelResult> {
    const url = input.configuration.teamsWebhookUrl;
    if (url === null) return result('teams', 0, 0, 'not_configured');
    const presentation = channel?.presentation;
    try {
      await this.teams(
        url,
        buildTeamsAlertCard({
          message: input.message,
          locale: channel === null ? 'bs' : resolveEmailLocale(null, channel),
          appName: presentation?.appName ?? 'EP Help Desk',
          openUrl: presentation?.publicUrl == null ? null : `${presentation.publicUrl}${opsHealthPath}`,
          now,
        }),
      );
      return result('teams', 1, 0, null);
    } catch (error) {
      return result('teams', 0, 1, errorText(error));
    }
  }
}

function result(channel: OpsChannel, delivered: number, failed: number, reason: string | null): OpsChannelResult {
  const status = failed === 0 ? (delivered === 0 ? 'skipped' : 'sent') : delivered === 0 ? 'failed' : 'partial';
  return { channel, status, delivered, failed, reason: status === 'sent' ? null : reason };
}

function errorText(error: unknown): string {
  // Messages of SMTP/fetch errors never contain the password or the webhook
  // token, but they can be long; keep logs readable.
  return (error instanceof Error ? error.message : String(error)).slice(0, 200);
}
