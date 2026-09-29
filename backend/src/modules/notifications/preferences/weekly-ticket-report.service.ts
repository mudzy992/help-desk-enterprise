import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { authorizationRoleKeys } from '../../authorization/authorization.constants';
import { SettingsService } from '../../settings/settings.service';
import { settingKeys } from '../../settings/setting-keys';
import { notificationPreferenceSettingDefaults } from '../../settings/definitions/notification-preference-settings';
import { readInstallationTimeZone } from '../../settings/read-installation-time-zone';
import { loadTicketSlaSnapshots } from '../../tickets/load-ticket-sla-snapshots';
import { resolveEmailLocale } from '../email/compose-ticket-email';
import { composeWeeklyTicketReportEmail } from '../email/compose-weekly-ticket-report-email';
import { deliverNotificationEmail } from '../email/deliver-notification-email';
import { isAllowedNotificationEmailAddress } from '../email/is-allowed-notification-email-address';
import {
  loadEmailChannelConfiguration,
  type EmailChannelConfiguration,
} from '../email/load-email-channel-configuration';
import { MAIL_TRANSPORT, type MailTransport } from '../email/mail-transport';
import { loadNotificationPreferencePolicy } from './notification-preference-policy';
import { parseClockMinute } from './notification-schedule-time';
import {
  buildWeeklyReportEntries,
  isoWeek,
  weeklyReportClosedStatuses,
  weeklyReportSlot,
  type WeeklyReportRole,
  type WeeklyReportTicket,
} from './weekly-ticket-report';

export const weeklyReportCategory = 'report.weeklyTickets';
/** Users handled per batch; one run handles at most `batchesPerRun` batches. */
const batchSize = 200;
const batchesPerRun = 5;
/** A slot missed by more than a day (worker down) is skipped, not sent late. */
const lateSendWindowMs = 24 * 3_600_000;

export type WeeklyReportConfiguration = {
  readonly enabled: boolean;
  readonly dayOfWeek: number;
  readonly minute: number;
  readonly maxRows: number;
  readonly sendWhenEmpty: boolean;
  readonly timeZone: string;
};

export type WeeklyReportRunResult = {
  readonly considered: number;
  readonly sent: number;
  readonly skipped: number;
  readonly failures: number;
};

type Recipient = {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly preferredLocale: string | null;
};

const ticketSelect = {
  id: true,
  ticketNumber: true,
  title: true,
  status: true,
  priority: true,
  isConfidential: true,
  classification: true,
  createdAt: true,
  updatedAt: true,
} as const;

const agentRoleKeys = [authorizationRoleKeys.agent, authorizationRoleKeys.admin, authorizationRoleKeys.superAdmin];

/** Paket 2.2a: weekly e-mail listing each agent's open tickets. */
@Injectable()
export class WeeklyTicketReportService {
  private readonly logger = new Logger(WeeklyTicketReportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    @Inject(MAIL_TRANSPORT) private readonly mailTransport: MailTransport,
  ) {}

  async loadConfiguration(): Promise<WeeklyReportConfiguration> {
    const defaults = notificationPreferenceSettingDefaults.weeklyReport;
    const read = async (key: string) => {
      try {
        return await this.settingsService.getSetting(key);
      } catch {
        return undefined;
      }
    };
    const [enabled, day, time, maxRows, sendWhenEmpty, timeZone] = await Promise.all([
      read(settingKeys.privateNotificationsWeeklyReportEnabled),
      read(settingKeys.privateNotificationsWeeklyReportDayOfWeek),
      read(settingKeys.privateNotificationsWeeklyReportTime),
      read(settingKeys.privateNotificationsWeeklyReportMaxRows),
      read(settingKeys.privateNotificationsWeeklyReportSendWhenEmpty),
      readInstallationTimeZone(this.settingsService),
    ]);
    const integer = (value: unknown, min: number, max: number, fallback: number) =>
      typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : fallback;
    return {
      enabled: enabled !== false,
      dayOfWeek: integer(day, 1, 7, defaults.dayOfWeek),
      minute: parseClockMinute(typeof time === 'string' ? time : defaults.time, 7 * 60),
      maxRows: integer(maxRows, defaults.maxRows.min, defaults.maxRows.max, defaults.maxRows.default),
      sendWhenEmpty: sendWhenEmpty === true,
      timeZone,
    };
  }

  async runDue(now = new Date()): Promise<WeeklyReportRunResult> {
    const empty = { considered: 0, sent: 0, skipped: 0, failures: 0 };
    const configuration = await this.loadConfiguration();
    if (!configuration.enabled) return empty;
    const channel = await loadEmailChannelConfiguration(this.settingsService);
    if (!channel.deliveryEnabled || channel.smtp === null) return empty;
    const slot = weeklyReportSlot(now, configuration.timeZone, configuration.dayOfWeek, configuration.minute);
    if (now.getTime() - slot.getTime() > lateSendWindowMs) return empty;
    const policy = await loadNotificationPreferencePolicy(this.settingsService);
    const optOutAllowed = !policy.lockedEmail.has(weeklyReportCategory) && policy.preferencesEnabled;
    const week = isoWeek(slot, configuration.timeZone);
    let considered = 0;
    let sent = 0;
    let skipped = 0;
    let failures = 0;
    for (let batch = 0; batch < batchesPerRun; batch += 1) {
      const users = (await this.prisma.user.findMany({
        where: {
          isActive: true,
          userRoles: { some: { role: { key: { in: agentRoleKeys } } } },
          OR: [
            { notificationSchedule: { is: null } },
            { notificationSchedule: { is: { lastWeeklyReportAt: null } } },
            { notificationSchedule: { is: { lastWeeklyReportAt: { lt: slot } } } },
          ],
        },
        select: { id: true, email: true, displayName: true, preferredLocale: true },
        orderBy: { id: 'asc' },
        take: batchSize,
      })) as Recipient[];
      if (users.length === 0) break;
      considered += users.length;
      const optedOut = optOutAllowed ? await this.optedOutUserIds(users.map((user) => user.id)) : new Set<string>();
      const memberships = await this.loadMemberships(users.map((user) => user.id));
      const sla = await loadTicketSlaSnapshots(this.prisma, [
        ...new Set([...memberships.values()].flatMap((rows) => rows.map((row) => row.ticket.id))),
      ]);
      for (const user of users) {
        try {
          const outcome = optedOut.has(user.id)
            ? 'skipped'
            : await this.sendFor(user, memberships.get(user.id) ?? [], sla, channel, configuration, {
                now,
                week,
                dedupeKey: `weekly:${week.year}-W${String(week.week).padStart(2, '0')}`,
              });
          if (outcome === 'sent') sent += 1;
          else skipped += 1;
          await this.markSent(user.id, slot);
        } catch (error) {
          failures += 1;
          // Mark anyway: a broken address must not be retried every 5 minutes all week.
          await this.markSent(user.id, slot).catch(() => undefined);
          this.logger.warn(
            `weekly_ticket_report_failed user=${user.id} reason=${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      if (users.length < batchSize) break;
    }
    if (considered > 0) {
      this.logger.log(
        `weekly_ticket_report_slot=${slot.toISOString()} considered=${considered} sent=${sent} skipped=${skipped} failures=${failures}`,
      );
    }
    return { considered, sent, skipped, failures };
  }

  /** W12: "send me a test report" — current tickets, `[TEST]`, slot not consumed. */
  async sendTest(userId: string, now = new Date()): Promise<{ readonly sent: boolean; readonly reason?: string }> {
    const channel = await loadEmailChannelConfiguration(this.settingsService);
    if (!channel.deliveryEnabled || channel.smtp === null) return { sent: false, reason: 'EMAIL_CHANNEL_DISABLED' };
    const user = (await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, displayName: true, preferredLocale: true },
    })) as Recipient | null;
    if (user === null) return { sent: false, reason: 'USER_NOT_FOUND' };
    const configuration = await this.loadConfiguration();
    const memberships = await this.loadMemberships([userId]);
    const rows = memberships.get(userId) ?? [];
    const sla = await loadTicketSlaSnapshots(this.prisma, rows.map((row) => row.ticket.id));
    const composed = composeWeeklyTicketReportEmail({
      configuration: channel,
      locale: resolveEmailLocale(user.preferredLocale, channel),
      recipientId: user.id,
      recipientName: user.displayName,
      entries: buildWeeklyReportEntries({ memberships: rows, sla, now }),
      maxRows: configuration.maxRows,
      timeZone: configuration.timeZone,
      week: isoWeek(now, configuration.timeZone),
      now,
      dedupeKey: `weekly-test:${now.getTime()}`,
    });
    await this.mailTransport.send(
      {
        from: channel.smtp.fromAddress,
        to: user.email,
        subject: `[TEST] ${composed.subject}`,
        text: composed.text,
        html: composed.html,
        messageId: composed.messageId,
        headers: composed.headers,
      },
      channel.smtp,
    );
    return { sent: true };
  }

  private async sendFor(
    user: Recipient,
    memberships: readonly { ticket: WeeklyReportTicket; role: WeeklyReportRole }[],
    sla: Awaited<ReturnType<typeof loadTicketSlaSnapshots>>,
    channel: EmailChannelConfiguration,
    configuration: WeeklyReportConfiguration,
    context: { readonly now: Date; readonly week: { year: number; week: number }; readonly dedupeKey: string },
  ): Promise<'sent' | 'skipped'> {
    if (
      !isAllowedNotificationEmailAddress(user.email, {
        internalOnly: channel.internalOnly,
        internalDomains: channel.internalDomains,
        allowedExternalDomains: channel.allowedExternalDomains,
        allowedExternalEmails: channel.allowedExternalEmails,
      })
    ) {
      return 'skipped';
    }
    const entries = buildWeeklyReportEntries({ memberships, sla, now: context.now });
    if (entries.length === 0 && !configuration.sendWhenEmpty) return 'skipped';
    const composed = composeWeeklyTicketReportEmail({
      configuration: channel,
      locale: resolveEmailLocale(user.preferredLocale, channel),
      recipientId: user.id,
      recipientName: user.displayName,
      entries,
      maxRows: configuration.maxRows,
      timeZone: configuration.timeZone,
      week: context.week,
      now: context.now,
      dedupeKey: context.dedupeKey,
    });
    await deliverNotificationEmail(this.prisma, this.mailTransport, channel, {
      userId: user.id,
      toAddress: user.email,
      dedupeKey: context.dedupeKey,
      templateKey: 'report.weekly_tickets',
      subject: composed.subject,
      text: composed.text,
      html: composed.html,
      messageId: composed.messageId,
      headers: composed.headers,
    });
    return 'sent';
  }

  private async markSent(userId: string, slot: Date): Promise<void> {
    await this.prisma.userNotificationSchedule.upsert({
      where: { userId },
      create: { userId, lastWeeklyReportAt: slot },
      update: { lastWeeklyReportAt: slot },
    });
  }

  private async optedOutUserIds(userIds: readonly string[]): Promise<Set<string>> {
    const rows = await this.prisma.userNotificationPreference.findMany({
      where: { userId: { in: [...userIds] }, category: weeklyReportCategory, email: 'OFF' },
      select: { userId: true },
    });
    return new Set(rows.map((row) => row.userId));
  }

  /** Two queries per batch: direct assignment and personal participant rows. */
  private async loadMemberships(
    userIds: readonly string[],
  ): Promise<Map<string, { ticket: WeeklyReportTicket; role: WeeklyReportRole }[]>> {
    const open = { notIn: [...weeklyReportClosedStatuses] };
    const [assigned, participants] = await Promise.all([
      this.prisma.ticket.findMany({
        where: { assignedUserId: { in: [...userIds] }, status: open as never, mergedIntoTicketId: null },
        select: { ...ticketSelect, assignedUserId: true },
      }),
      this.prisma.ticketParticipant.findMany({
        where: {
          userId: { in: [...userIds] },
          role: { in: ['ASSIGNEE', 'WATCHER', 'APPROVER'] },
          ticket: { status: open as never, mergedIntoTicketId: null },
        },
        select: { userId: true, role: true, ticket: { select: ticketSelect } },
      }),
    ]);
    const byUser = new Map<string, { ticket: WeeklyReportTicket; role: WeeklyReportRole }[]>();
    const push = (userId: string | null, ticket: WeeklyReportTicket, role: WeeklyReportRole) => {
      if (userId === null) return;
      const list = byUser.get(userId) ?? [];
      list.push({ ticket, role });
      byUser.set(userId, list);
    };
    for (const ticket of assigned) push(ticket.assignedUserId, ticket as unknown as WeeklyReportTicket, 'ASSIGNEE');
    for (const row of participants) {
      push(row.userId, row.ticket as unknown as WeeklyReportTicket, row.role as WeeklyReportRole);
    }
    return byUser;
  }
}
