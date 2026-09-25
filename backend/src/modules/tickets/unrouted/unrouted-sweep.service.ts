import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { persistInAppNotification } from '../../notifications/fan-out/persist-in-app-notification';
import { notificationTypes } from '../../notifications/notifications.constants';
import type { NotificationPayload } from '../../notifications/notifications.types';
import { UnroutedQueueConfigurationLoader } from './unrouted-queue-configuration.loader';
import type { UnroutedQueueConfiguration } from './unrouted-queue.types';
import {
  buildUnroutedOverdueWhere,
  unroutedCutoff,
} from './build-unrouted-overdue-where';
import {
  unroutedDigestTimeZone,
  unroutedSweepBatchSize,
} from './unrouted-sweep.job.constants';

export type UnroutedSweepResult = {
  readonly warnedTickets: number;
  readonly notifications: number;
  readonly digestNotifications: number;
};

/**
 * Package 1.7 (U2): one-time overdue warning per ticket plus the Monday
 * digest. Both are idempotent through notification dedupe keys, so a retried
 * or duplicated run never notifies twice.
 */
@Injectable()
export class UnroutedSweepService {
  private readonly logger = new Logger(UnroutedSweepService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configurationLoader: UnroutedQueueConfigurationLoader,
  ) {}

  async processDue(now = new Date()): Promise<UnroutedSweepResult> {
    const configuration = await this.configurationLoader.load();
    if (configuration.cleanupSlaHours === 0) {
      return { warnedTickets: 0, notifications: 0, digestNotifications: 0 };
    }
    const targetGroupId = await this.existingTargetGroupId(configuration);
    const overdueWhere = buildUnroutedOverdueWhere({
      cutoff: unroutedCutoff(now, configuration.cleanupSlaHours),
      targetGroupId,
    });
    const recipients = await this.resolveRecipients(configuration.ownerRole, targetGroupId);
    const due = await this.prisma.ticket.findMany({
      where: { ...overdueWhere, unroutedWarnedAt: null },
      select: { id: true, ticketNumber: true, title: true, isConfidential: true },
      orderBy: { createdAt: 'asc' },
      take: unroutedSweepBatchSize,
    });
    let notifications = 0;
    for (const ticket of due) {
      for (const userId of recipients) {
        const created = await persistInAppNotification(this.prisma, {
          userId,
          type: notificationTypes.ticketUnroutedOverdue,
          title: 'notifications.items.ticketUnroutedOverdue',
          body: ticket.isConfidential ? null : ticket.title,
          ticketId: ticket.id,
          payload: {
            ticketId: ticket.id,
            ticketNumber: ticket.ticketNumber,
            event: notificationTypes.ticketUnroutedOverdue,
            messageId: `unrouted-overdue:${ticket.id}`,
            actorUserId: null,
            confidential: ticket.isConfidential,
          } satisfies NotificationPayload,
          dedupeKey: `unrouted-overdue:${ticket.id}:${userId}`,
        });
        if (created !== null) {
          notifications += 1;
        }
      }
      await this.prisma.ticket.update({
        where: { id: ticket.id },
        data: { unroutedWarnedAt: now },
      });
    }
    const digestNotifications =
      configuration.weeklyDigest && isDigestSlot(now)
        ? await this.sendDigest(now, overdueWhere, recipients)
        : 0;
    return { warnedTickets: due.length, notifications, digestNotifications };
  }

  private async sendDigest(
    now: Date,
    overdueWhere: ReturnType<typeof buildUnroutedOverdueWhere>,
    recipients: readonly string[],
  ): Promise<number> {
    const total = await this.prisma.ticket.count({ where: overdueWhere });
    if (total === 0) {
      return 0;
    }
    const day = localDateKey(now);
    let sent = 0;
    for (const userId of recipients) {
      const created = await persistInAppNotification(this.prisma, {
        userId,
        type: notificationTypes.ticketUnroutedDigest,
        title: 'notifications.items.ticketUnroutedDigest',
        body: String(total),
        ticketId: null,
        payload: {
          ticketId: '',
          ticketNumber: '',
          event: notificationTypes.ticketUnroutedDigest,
          messageId: `unrouted-digest:${day}`,
          actorUserId: null,
          confidential: false,
        } satisfies NotificationPayload,
        dedupeKey: `unrouted-digest:${day}:${userId}`,
      });
      if (created !== null) {
        sent += 1;
      }
    }
    return sent;
  }

  private async existingTargetGroupId(
    configuration: UnroutedQueueConfiguration,
  ): Promise<string | null> {
    if (configuration.targetGroupId === null) {
      return null;
    }
    const group = await this.prisma.group.findUnique({
      where: { id: configuration.targetGroupId },
      select: { id: true },
    });
    if (group === null) {
      this.logger.warn(
        `Unrouted target group ${configuration.targetGroupId} no longer exists; tickets fall back to UNROUTED`,
      );
    }
    return group?.id ?? null;
  }

  private async resolveRecipients(
    ownerRole: string,
    targetGroupId: string | null,
  ): Promise<readonly string[]> {
    const [owners, members] = await Promise.all([
      this.prisma.userRole.findMany({
        where: { role: { key: ownerRole }, user: { isActive: true } },
        select: { userId: true },
      }),
      targetGroupId === null
        ? Promise.resolve([])
        : this.prisma.groupMember.findMany({
            where: { groupId: targetGroupId, user: { isActive: true } },
            select: { userId: true },
          }),
    ]);
    return [...new Set([...owners, ...members].map((row) => row.userId))];
  }
}

function localParts(now: Date): Record<string, string> {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: unroutedDigestTimeZone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

/** Monday 08:00–08:14 local time: exactly one quarter-hour run qualifies. */
export function isDigestSlot(now: Date): boolean {
  const parts = localParts(now);
  return parts.weekday === 'Mon' && parts.hour === '08' && Number(parts.minute) < 15;
}

function localDateKey(now: Date): string {
  const parts = localParts(now);
  return `${parts.year}-${parts.month}-${parts.day}`;
}
