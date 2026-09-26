import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { SettingsService } from '../../settings/settings.service';
import { composeDigestEmail, type DigestTicketFacts } from '../email/compose-digest-email';
import { resolveEmailLocale } from '../email/compose-ticket-email';
import { deliverNotificationEmail } from '../email/deliver-notification-email';
import { isAllowedNotificationEmailAddress } from '../email/is-allowed-notification-email-address';
import {
  loadEmailChannelConfiguration,
  type EmailChannelConfiguration,
} from '../email/load-email-channel-configuration';
import { MAIL_TRANSPORT, type MailTransport } from '../email/mail-transport';
import {
  notificationDigestItemsPerUser,
  notificationDigestUsersPerRun,
} from './notification-digest.constants';
import {
  loadNotificationPreferencePolicy,
  type NotificationPreferencePolicy,
} from './notification-preference-policy';
import { planDigestRun, type DigestScheduleRow, type PendingDigestSummary } from './plan-digest-run';

export type DigestRunResult = {
  readonly usersWithItems: number;
  readonly emailsSent: number;
  readonly itemsDelivered: number;
  readonly itemsDropped: number;
  readonly failures: number;
};

const emptyResult: DigestRunResult = {
  usersWithItems: 0,
  emailsSent: 0,
  itemsDelivered: 0,
  itemsDropped: 0,
  failures: 0,
};

type Recipient = {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly preferredLocale: string | null;
  readonly isActive: boolean;
};

/**
 * Paket 2.2 (§5): sends due digests and quiet-hours summaries. BullMQ hands a
 * scheduled job to one worker; the `NotificationEmailDelivery` claim keyed by
 * slot/item set stops a duplicate e-mail if a pass is retried.
 */
@Injectable()
export class NotificationDigestService {
  private readonly logger = new Logger(NotificationDigestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    @Inject(MAIL_TRANSPORT) private readonly mailTransport: MailTransport,
  ) {}

  async runDue(now = new Date()): Promise<DigestRunResult> {
    const configuration = await loadEmailChannelConfiguration(this.settingsService);
    if (!configuration.deliveryEnabled || configuration.smtp === null) {
      // Items stay; the daily retention drops them after 7 days.
      return emptyResult;
    }
    const policy = await loadNotificationPreferencePolicy(this.settingsService);
    const summaries = await this.pendingSummaries();
    if (summaries.size === 0) return emptyResult;
    const userIds = [...summaries.keys()];
    const [users, schedules] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, email: true, displayName: true, preferredLocale: true, isActive: true },
      }),
      this.prisma.userNotificationSchedule.findMany({ where: { userId: { in: userIds } } }),
    ]);
    const usersById = new Map(users.map((user) => [user.id, user as Recipient]));
    const schedulesById = new Map(schedules.map((row) => [row.userId, row as DigestScheduleRow]));
    let emailsSent = 0;
    let itemsDelivered = 0;
    let itemsDropped = 0;
    let failures = 0;
    for (const userId of userIds) {
      const user = usersById.get(userId);
      if (user === undefined || !user.isActive) {
        // N11: a deactivated account gets no digest.
        itemsDropped += (await this.prisma.notificationDigestItem.deleteMany({ where: { userId } })).count;
        continue;
      }
      const plan = planDigestRun({
        policy,
        schedule: schedulesById.get(userId),
        pending: summaries.get(userId) as PendingDigestSummary,
        now,
      });
      if (plan.kind === 'none') continue;
      try {
        const outcome = await this.sendFor(user, plan, configuration, policy, now);
        if (outcome.sent) emailsSent += 1;
        itemsDelivered += outcome.delivered;
        itemsDropped += outcome.dropped;
      } catch (error) {
        failures += 1;
        this.logger.warn(
          `notification_digest_failed user=${userId} reason=${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return { usersWithItems: userIds.length, emailsSent, itemsDelivered, itemsDropped, failures };
  }

  /** One grouped query: oldest held item per user and reason. */
  private async pendingSummaries(): Promise<Map<string, PendingDigestSummary>> {
    // Prisma's generic groupBy typing does not narrow with orderBy+take; the shape is fixed.
    const delegate = this.prisma.notificationDigestItem;
    const groupBy = delegate.groupBy.bind(delegate) as unknown as (args: unknown) => Promise<unknown>;
    const rows = (await groupBy({
      by: ['userId', 'reason'],
      _min: { createdAt: true },
      orderBy: { userId: 'asc' },
      take: notificationDigestUsersPerRun * 2,
    })) as Array<{ userId: string; reason: string; _min: { createdAt: Date | null } }>;
    const summaries = new Map<string, { oldestDigest: Date | null; oldestQuiet: Date | null }>();
    for (const row of rows) {
      const summary = summaries.get(row.userId) ?? { oldestDigest: null, oldestQuiet: null };
      if (row.reason === 'DIGEST') summary.oldestDigest = row._min.createdAt;
      if (row.reason === 'QUIET') summary.oldestQuiet = row._min.createdAt;
      summaries.set(row.userId, summary);
    }
    return summaries;
  }

  private async sendFor(
    user: Recipient,
    plan: Exclude<ReturnType<typeof planDigestRun>, { kind: 'none' }>,
    configuration: EmailChannelConfiguration,
    policy: NotificationPreferencePolicy,
    now: Date,
  ): Promise<{ sent: boolean; delivered: number; dropped: number }> {
    const items = await this.prisma.notificationDigestItem.findMany({
      where: { userId: user.id, reason: { in: [...plan.reasons] }, createdAt: { lte: now } },
      orderBy: { createdAt: 'asc' },
      take: notificationDigestItemsPerUser,
      select: { id: true, ticketId: true, category: true, createdAt: true },
    });
    if (items.length === 0) return { sent: false, delivered: 0, dropped: 0 };
    const ids = items.map((item) => item.id);
    if (
      !isAllowedNotificationEmailAddress(user.email, {
        internalOnly: configuration.internalOnly,
        allowedExternalDomains: configuration.allowedExternalDomains,
        allowedExternalEmails: configuration.allowedExternalEmails,
      })
    ) {
      await this.prisma.notificationDigestItem.deleteMany({ where: { id: { in: ids } } });
      return { sent: false, delivered: 0, dropped: ids.length };
    }
    const ticketIds = [...new Set(items.flatMap((item) => (item.ticketId === null ? [] : [item.ticketId])))];
    const tickets = await this.prisma.ticket.findMany({
      where: { id: { in: ticketIds } },
      select: {
        id: true,
        ticketNumber: true,
        title: true,
        status: true,
        priority: true,
        isConfidential: true,
        classification: true,
      },
    });
    const ticketMap = new Map<string, DigestTicketFacts>(
      tickets.map((ticket) => [ticket.id, ticket as unknown as DigestTicketFacts]),
    );
    const last = items[items.length - 1] as (typeof items)[number];
    const dedupeKey =
      plan.kind === 'digest' && plan.slot !== null
        ? `digest:${plan.slot.toISOString()}:${last.id}`
        : `quiet:${last.id}`;
    const composed = composeDigestEmail({
      configuration,
      locale: resolveEmailLocale(user.preferredLocale, configuration),
      recipientId: user.id,
      recipientName: user.displayName,
      items,
      tickets: ticketMap,
      maxItems: policy.digestMaxItems,
      dedupeKey,
    });
    let sent = false;
    if (composed.ticketCount > 0) {
      await deliverNotificationEmail(this.prisma, this.mailTransport, configuration, {
        userId: user.id,
        toAddress: user.email,
        dedupeKey,
        templateKey: 'notification.digest',
        subject: composed.subject,
        text: composed.text,
        html: composed.html,
        messageId: composed.messageId,
        headers: composed.headers,
      });
      sent = true;
    }
    await this.prisma.$transaction([
      this.prisma.notificationDigestItem.deleteMany({ where: { id: { in: ids } } }),
      this.prisma.userNotificationSchedule.upsert({
        where: { userId: user.id },
        create: plan.kind === 'digest'
          ? { userId: user.id, lastDigestSentAt: now }
          : { userId: user.id, lastQuietFlushAt: now },
        update: plan.kind === 'digest' ? { lastDigestSentAt: now } : { lastQuietFlushAt: now },
      }),
    ]);
    return { sent, delivered: sent ? ids.length : 0, dropped: sent ? 0 : ids.length };
  }

  /** "Pošalji probni sažetak": current held items (not consumed) or the sample. */
  async sendTest(userId: string): Promise<{ readonly sent: boolean; readonly reason?: string }> {
    const configuration = await loadEmailChannelConfiguration(this.settingsService);
    if (!configuration.deliveryEnabled || configuration.smtp === null) {
      return { sent: false, reason: 'EMAIL_CHANNEL_DISABLED' };
    }
    const policy = await loadNotificationPreferencePolicy(this.settingsService);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, displayName: true, preferredLocale: true },
    });
    if (user === null) return { sent: false, reason: 'USER_NOT_FOUND' };
    const items = await this.prisma.notificationDigestItem.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      take: notificationDigestItemsPerUser,
      select: { ticketId: true, category: true, createdAt: true },
    });
    const ticketIds = [...new Set(items.flatMap((item) => (item.ticketId === null ? [] : [item.ticketId])))];
    const tickets = await this.prisma.ticket.findMany({
      where: { id: { in: ticketIds } },
      select: { id: true, ticketNumber: true, title: true, status: true, priority: true, isConfidential: true, classification: true },
    });
    const composed = composeDigestEmail({
      configuration,
      locale: resolveEmailLocale(user.preferredLocale, configuration),
      recipientId: user.id,
      recipientName: user.displayName,
      items,
      tickets: new Map(tickets.map((ticket) => [ticket.id, ticket as unknown as DigestTicketFacts])),
      maxItems: policy.digestMaxItems,
      dedupeKey: `digest-test:${Date.now()}`,
    });
    await this.mailTransport.send(
      {
        from: configuration.smtp.fromAddress,
        to: user.email,
        subject: `[TEST] ${composed.subject}`,
        text: composed.text,
        html: composed.html,
        messageId: composed.messageId,
        headers: composed.headers,
      },
      configuration.smtp,
    );
    return { sent: true };
  }
}
