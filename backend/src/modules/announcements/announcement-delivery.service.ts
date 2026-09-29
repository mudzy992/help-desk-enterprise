import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { resolveEmailLocale } from '../notifications/email/compose-ticket-email';
import { deliverNotificationEmail } from '../notifications/email/deliver-notification-email';
import { isAllowedNotificationEmailAddress } from '../notifications/email/is-allowed-notification-email-address';
import {
  loadEmailChannelConfiguration,
  type EmailChannelConfiguration,
} from '../notifications/email/load-email-channel-configuration';
import { MAIL_TRANSPORT, type MailTransport } from '../notifications/email/mail-transport';
import { notificationTypes } from '../notifications/notifications.constants';
import {
  loadNotificationPreferencePolicy,
  type DeliveryDecision,
} from '../notifications/preferences/notification-preference-policy';
import { resolveDeliveryDecisions } from '../notifications/preferences/resolve-delivery-decisions';
import { postTeamsWebhook, type TeamsPoster } from '../ops-health/teams-webhook';
import { readInstallationTimeZone } from '../settings/read-installation-time-zone';
import { settingKeys } from '../settings/setting-keys';
import { SettingsService } from '../settings/settings.service';
import { resolveAnnouncementTeamsUrl } from './announcement-teams-url';
import { buildAnnouncementTeamsCard } from './announcement-teams-card';
import { AnnouncementsService } from './announcements.service';
import { announcementPath, composeAnnouncementEmail, type AnnouncementEmailKind } from './compose-announcement-email';

export const ANNOUNCEMENT_TEAMS_POSTER = Symbol('ANNOUNCEMENT_TEAMS_POSTER');

/** Users read per batch (one decisions query per batch). */
export const announcementEmailBatchSize = 100;
/** Open runs looked at per sweep. */
const runsPerSweep = 10;
/** Teams posts per sweep (webhooks are rate limited). */
const teamsPerSweep = 10;

export type AnnouncementEmailRecipient = {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly preferredLocale: string | null;
};

export type AnnouncementEmailSkipReason = 'PREFERENCE_OFF' | 'NOT_IMMEDIATE' | 'ADDRESS_NOT_ALLOWED';

/**
 * §K2b: who gets the e-mail. The preference of category `announcement` is
 * honoured: OFF never; IMMEDIATE now. DIGEST and quiet hours hold ticket
 * e-mails for a summary, but the digest lists tickets only, so a non-critical
 * announcement is not e-mailed to them (the in-app notification and the banner
 * still reach them). CRITICAL is the documented exception: it is sent at once.
 */
export function decideAnnouncementEmail(
  decision: DeliveryDecision | undefined,
  severity: 'INFO' | 'WARNING' | 'CRITICAL',
): 'SEND' | Exclude<AnnouncementEmailSkipReason, 'ADDRESS_NOT_ALLOWED'> {
  const email = decision?.email ?? 'IMMEDIATE';
  if (email === 'OFF') return 'PREFERENCE_OFF';
  if (email === 'IMMEDIATE' || severity === 'CRITICAL') return 'SEND';
  return 'NOT_IMMEDIATE';
}

type RunRow = {
  readonly id: string;
  readonly kind: AnnouncementEmailKind;
  readonly cursor: string | null;
  readonly announcement: {
    readonly id: string;
    readonly title: string;
    readonly body: string;
    readonly severity: 'INFO' | 'WARNING' | 'CRITICAL';
    readonly status: 'DRAFT' | 'PUBLISHED' | 'WITHDRAWN';
    readonly sendEmail: boolean;
    readonly requiresAcknowledgement: boolean;
    readonly startsAt: Date;
    readonly endsAt: Date;
    readonly audienceRoles: string[];
    readonly audienceOrganizationalUnitIds: string[];
    readonly audienceGroupIds: string[];
  };
};

/**
 * Paket 2.9 (K2b): the worker side of announcement delivery.
 *  - E-mail: `AnnouncementEmailRun` rows (created when an announcement starts
 *    or a reminder is sent) are walked in user-id batches within a time budget;
 *    the cursor makes a restart continue, the delivery ledger (dedupe per run
 *    and user) makes a replayed batch a no-op.
 *  - Teams: one Adaptive Card per announcement the author marked, once it has
 *    started, when the channel is enabled.
 */
@Injectable()
export class AnnouncementDeliveryService {
  private readonly logger = new Logger(AnnouncementDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly announcements: AnnouncementsService,
    @Inject(MAIL_TRANSPORT) private readonly mailTransport: MailTransport,
    @Optional() @Inject(ANNOUNCEMENT_TEAMS_POSTER) private readonly teams: TeamsPoster = postTeamsWebhook,
  ) {}

  async run(now: Date = new Date(), budgetMs = 90_000): Promise<{ emailed: number; teamsPosted: number }> {
    const deadline = Date.now() + budgetMs;
    const teamsPosted = await this.postTeams(now).catch((error: unknown) => {
      this.logger.warn(`announcement_teams_failed reason=${errorText(error)}`);
      return 0;
    });
    const emailed = await this.sendEmailRuns(now, deadline);
    return { emailed, teamsPosted };
  }

  // ------------------------------------------------------------ e-mail

  private async sendEmailRuns(now: Date, deadline: number): Promise<number> {
    const runs = (await this.prisma.announcementEmailRun.findMany({
      where: { completedAt: null },
      orderBy: { createdAt: 'asc' },
      take: runsPerSweep,
      select: {
        id: true,
        kind: true,
        cursor: true,
        announcement: {
          select: {
            id: true,
            title: true,
            body: true,
            severity: true,
            status: true,
            sendEmail: true,
            requiresAcknowledgement: true,
            startsAt: true,
            endsAt: true,
            audienceRoles: true,
            audienceOrganizationalUnitIds: true,
            audienceGroupIds: true,
          },
        },
      },
    })) as RunRow[];
    if (runs.length === 0) return 0;
    const channel = await loadEmailChannelConfiguration(this.settings).catch(() => null);
    if (channel === null || !channel.deliveryEnabled || channel.smtp === null) {
      // Predictable: nothing is mailed weeks later when SMTP is switched on.
      await this.prisma.announcementEmailRun.updateMany({
        where: { id: { in: runs.map((run) => run.id) }, completedAt: null },
        data: { completedAt: now, endReason: 'EMAIL_CHANNEL_DISABLED' },
      });
      return 0;
    }
    const timeZone = await readInstallationTimeZone(this.settings);
    let sent = 0;
    for (const run of runs) {
      if (Date.now() >= deadline) break;
      try {
        sent += await this.processRun(run, channel, timeZone, now, deadline);
      } catch (error) {
        this.logger.warn(`announcement_email_run_failed run=${run.id} reason=${errorText(error)}`);
      }
    }
    return sent;
  }

  private async processRun(
    run: RunRow,
    channel: EmailChannelConfiguration,
    timeZone: string,
    now: Date,
    deadline: number,
  ): Promise<number> {
    const { announcement } = run;
    const active =
      announcement.status === 'PUBLISHED' &&
      announcement.startsAt.getTime() <= now.getTime() &&
      announcement.endsAt.getTime() > now.getTime();
    const endReason = !active
      ? 'NOT_ACTIVE'
      : !announcement.sendEmail
        ? 'EMAIL_OFF'
        : run.kind === 'REMINDER' && !announcement.requiresAcknowledgement
          ? 'NO_ACKNOWLEDGEMENT'
          : null;
    if (endReason !== null) {
      await this.prisma.announcementEmailRun.update({ where: { id: run.id }, data: { completedAt: now, endReason } });
      return 0;
    }
    const type = run.kind === 'PUBLISHED' ? notificationTypes.announcementPublished : notificationTypes.announcementReminder;
    const policy = await loadNotificationPreferencePolicy(this.settings);
    const audienceWhere = await this.announcements.audienceWhereFor({
      roles: announcement.audienceRoles,
      organizationalUnitIds: announcement.audienceOrganizationalUnitIds,
      groupIds: announcement.audienceGroupIds,
    });
    const dedupeKey = `announcement-email:${run.id}`;
    let cursor = run.cursor;
    let sentTotal = 0;
    while (Date.now() < deadline) {
      const users: AnnouncementEmailRecipient[] = await this.prisma.user.findMany({
        where: {
          ...audienceWhere,
          ...(cursor === null ? {} : { id: { gt: cursor } }),
          ...(run.kind === 'REMINDER' ? { announcementAcknowledgements: { none: { announcementId: announcement.id } } } : {}),
        },
        orderBy: { id: 'asc' },
        take: announcementEmailBatchSize,
        select: { id: true, email: true, displayName: true, preferredLocale: true },
      });
      const decisions = await resolveDeliveryDecisions(this.prisma, policy, {
        type,
        userIds: users.map((user) => user.id),
        now,
      });
      let sent = 0;
      let skipped = 0;
      let failed = 0;
      for (const user of users) {
        const verdict = decideAnnouncementEmail(decisions.get(user.id), announcement.severity);
        if (
          verdict !== 'SEND' ||
          !isAllowedNotificationEmailAddress(user.email, {
            internalOnly: channel.internalOnly,
            internalDomains: channel.internalDomains,
            allowedExternalDomains: channel.allowedExternalDomains,
            allowedExternalEmails: channel.allowedExternalEmails,
          })
        ) {
          skipped += 1;
          continue;
        }
        try {
          const composed = composeAnnouncementEmail({
            configuration: channel,
            locale: resolveEmailLocale(user.preferredLocale, channel),
            timeZone,
            kind: run.kind,
            recipientKey: user.id,
            recipientName: user.displayName,
            announcement,
            dedupeKey,
          });
          await deliverNotificationEmail(this.prisma, this.mailTransport, channel, {
            userId: user.id,
            toAddress: user.email,
            dedupeKey,
            templateKey: run.kind === 'PUBLISHED' ? 'announcement.published' : 'announcement.reminder',
            subject: composed.subject,
            text: composed.text,
            html: composed.html,
            messageId: composed.messageId,
            headers: composed.headers,
          });
          sent += 1;
        } catch (error) {
          failed += 1;
          this.logger.warn(`announcement_email_user_failed run=${run.id} reason=${errorText(error)}`);
        }
      }
      const last = users[users.length - 1];
      const done = users.length < announcementEmailBatchSize;
      cursor = last?.id ?? cursor;
      await this.prisma.announcementEmailRun.update({
        where: { id: run.id },
        data: {
          cursor,
          sentCount: { increment: sent },
          skippedCount: { increment: skipped },
          failedCount: { increment: failed },
          ...(done ? { completedAt: new Date() } : {}),
        },
      });
      sentTotal += sent;
      if (done) break;
    }
    return sentTotal;
  }

  // ------------------------------------------------------------ Teams

  /** Enabled flag and the webhook (own, else the alarm webhook of 2.7). */
  async teamsTarget(): Promise<string | null> {
    if ((await this.settings.getSetting(settingKeys.privateAnnouncementsTeamsEnabled).catch(() => false)) !== true) {
      return null;
    }
    return resolveAnnouncementTeamsUrl(this.settings);
  }

  private async postTeams(now: Date): Promise<number> {
    const due = await this.prisma.announcement.findMany({
      where: {
        status: 'PUBLISHED',
        postToTeams: true,
        teamsPostedAt: null,
        startsAt: { lte: now },
        endsAt: { gt: now },
      },
      orderBy: { startsAt: 'asc' },
      take: teamsPerSweep,
      select: {
        id: true,
        title: true,
        body: true,
        severity: true,
        startsAt: true,
        endsAt: true,
        service: { select: { name: true } },
      },
    });
    if (due.length === 0) return 0;
    const url = await this.teamsTarget();
    if (url === null) {
      // Switched off (or the webhook removed) after the author ticked it.
      await this.prisma.announcement.updateMany({
        where: { id: { in: due.map((row) => row.id) }, teamsPostedAt: null },
        data: { teamsPostedAt: now, teamsResult: 'SKIPPED_DISABLED' },
      });
      return 0;
    }
    const channel = await loadEmailChannelConfiguration(this.settings).catch(() => null);
    const presentation = channel?.presentation;
    const locale = channel === null ? 'bs' : resolveEmailLocale(null, channel);
    const timeZone = await readInstallationTimeZone(this.settings);
    let posted = 0;
    for (const row of due) {
      const claimed = await this.prisma.announcement.updateMany({
        where: { id: row.id, teamsPostedAt: null },
        data: { teamsPostedAt: now },
      });
      if (claimed.count !== 1) continue;
      let result: 'SENT' | 'FAILED' = 'SENT';
      try {
        await this.teams(
          url,
          buildAnnouncementTeamsCard({
            announcement: { ...row, serviceName: row.service?.name ?? null },
            locale,
            timeZone,
            appName: presentation?.appName ?? 'Help Desk',
            openUrl: presentation?.publicUrl == null ? null : `${presentation.publicUrl}${announcementPath(row.id)}`,
          }),
        );
        posted += 1;
      } catch (error) {
        result = 'FAILED';
        this.logger.warn(`announcement_teams_post_failed id=${row.id} reason=${errorText(error)}`);
      }
      await this.prisma.announcement.update({ where: { id: row.id }, data: { teamsResult: result } });
    }
    return posted;
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 200) : 'unknown';
}
