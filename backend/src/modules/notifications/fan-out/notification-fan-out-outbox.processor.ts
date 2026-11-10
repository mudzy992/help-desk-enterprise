import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import {
  TransactionalOutboxService,
  type OutboxDelivery,
} from '../../../common/outbox/transactional-outbox.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { TicketMessageRecord } from '../../tickets/collaboration.types';
import { toTicketRealtimePayload } from '../../tickets/to-collaboration-response';
import type { TicketRecord } from '../../tickets/tickets.types';
import { NotificationsFanOutService } from './notifications-fan-out.service';
import {
  notificationFanOutDeadLetterReplayBatchSize,
  notificationFanOutDeadLetterReplayCooldownMs,
  notificationFanOutOutboxDrainIntervalMs,
  notificationFanOutOutboxMaxDispatchPerTick,
  notificationFanOutOutboxWarningAgeMs,
  notificationTicketMessageFanOutTopic,
} from './notification-fan-out-outbox.constants';

const systemReplayActor = 'notification-fanout-reconciler';
const systemReplayReason =
  'Automatic recovery retry after notification fan-out dead-letter cooldown';

export type NotificationFanOutOutboxHealth = Readonly<{
  status: 'ok' | 'degraded';
  pending: number;
  processing: number;
  deadLetter: number;
  oldestPendingAgeMs: number;
}>;

/** Delivers ticket-message notifications from the transactionally-created outbox. */
@Injectable()
export class NotificationFanOutOutboxProcessor
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(NotificationFanOutOutboxProcessor.name);
  private timer?: ReturnType<typeof setInterval>;
  private lastDeadLetterReplayAt = 0;
  private draining = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: TransactionalOutboxService,
    private readonly fanOut: NotificationsFanOutService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.drain().catch((error: unknown) => {
        this.logger.warn(`notification_fanout_drain_failed reason=${errorText(error)}`);
      });
    }, notificationFanOutOutboxDrainIntervalMs);
    this.timer.unref?.();
    void this.drain().catch((error: unknown) => {
      this.logger.warn(`notification_fanout_drain_failed reason=${errorText(error)}`);
    });
  }

  onApplicationShutdown(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
  }

  async drain(now: Date = new Date()): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      for (
        let index = 0;
        index < notificationFanOutOutboxMaxDispatchPerTick;
        index += 1
      ) {
        const result = await this.outbox.dispatchOne(
          notificationTicketMessageFanOutTopic,
          (delivery) => this.deliver(delivery),
        );
        if (result === 'idle') break;
      }
      if (
        now.getTime() - this.lastDeadLetterReplayAt >=
        notificationFanOutDeadLetterReplayCooldownMs
      ) {
        await this.replayEligibleDeadLetters(now);
        this.lastDeadLetterReplayAt = now.getTime();
      }
    } finally {
      this.draining = false;
    }
  }

  async health(now: Date = new Date()): Promise<NotificationFanOutOutboxHealth> {
    const where = { topic: notificationTicketMessageFanOutTopic };
    const activeStatuses: Array<'PENDING' | 'PROCESSING'> = [
      'PENDING',
      'PROCESSING',
    ];
    const active = { ...where, status: { in: activeStatuses } };
    const [pending, processing, deadLetter, oldest] = await Promise.all([
      this.prisma.outboxMessage.count({ where: { ...where, status: 'PENDING' } }),
      this.prisma.outboxMessage.count({ where: { ...where, status: 'PROCESSING' } }),
      this.prisma.outboxMessage.count({ where: { ...where, status: 'DEAD_LETTER' } }),
      this.prisma.outboxMessage.findFirst({
        where: active,
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
    ]);
    const oldestPendingAgeMs =
      oldest === null ? 0 : Math.max(0, now.getTime() - oldest.createdAt.getTime());
    return {
      status:
        deadLetter > 0 ||
        oldestPendingAgeMs >= notificationFanOutOutboxWarningAgeMs
          ? 'degraded'
          : 'ok',
      pending,
      processing,
      deadLetter,
      oldestPendingAgeMs,
    };
  }

  private async deliver(delivery: OutboxDelivery): Promise<void> {
    const payload = asPayload(delivery.payload);
    if (
      typeof payload.messageId !== 'string' ||
      typeof payload.ticketId !== 'string'
    ) {
      throw new Error('INVALID_NOTIFICATION_TICKET_MESSAGE_FANOUT');
    }
    const [message, ticket] = await Promise.all([
      this.prisma.ticketMessage.findUnique({
        where: { id: payload.messageId },
      }),
      this.prisma.ticket.findUnique({ where: { id: payload.ticketId } }),
    ]);
    // A message/ticket removed by retention before delivery is no longer actionable.
    if (message === null || ticket === null) return;
    if (message.ticketId !== ticket.id) {
      throw new Error('NOTIFICATION_TICKET_MESSAGE_MISMATCH');
    }
    await this.fanOut.processDurableTicketMessage(
      toTicketRealtimePayload(
        message as TicketMessageRecord,
        ticket as TicketRecord,
      ),
    );
  }

  private async replayEligibleDeadLetters(now: Date): Promise<void> {
    const cutoff = new Date(
      now.getTime() - notificationFanOutDeadLetterReplayCooldownMs,
    );
    const rows = await this.prisma.outboxMessage.findMany({
      where: {
        topic: notificationTicketMessageFanOutTopic,
        status: 'DEAD_LETTER',
        OR: [
          { lastReplayedAt: null, createdAt: { lte: cutoff } },
          { lastReplayedAt: { lte: cutoff } },
        ],
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
      take: notificationFanOutDeadLetterReplayBatchSize,
    });
    for (const row of rows) {
      try {
        await this.outbox.replayDeadLetter(row.id, {
          actor: systemReplayActor,
          reason: systemReplayReason,
        });
      } catch (error) {
        // Another API replica may have replayed this row first.
        if (!isReplayConflict(error)) throw error;
      }
    }
  }
}

function asPayload(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function isReplayConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'OUTBOX_REPLAY_CONFLICT'
  );
}

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 200);
}
