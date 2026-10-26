import { Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { TransactionalOutboxService, type OutboxDelivery } from '../../../common/outbox/transactional-outbox.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { TicketSlaTimersService } from '../../sla/ticket-sla-timers.service';
import type { TicketStatus } from '../../../generated/prisma/enums';
import { reopenSlaOutboxTopic } from './reopen-same-ticket';

const intervalMs = 5_000;

@Injectable()
export class ReopenSlaOutboxReconciler implements OnModuleInit, OnApplicationShutdown {
  private timer?: ReturnType<typeof setInterval>;
  constructor(private readonly prisma: PrismaService, private readonly outbox: TransactionalOutboxService, private readonly slaTimers: TicketSlaTimersService) {}
  onModuleInit(): void {
    this.timer = setInterval(() => void this.drain().catch(() => undefined), intervalMs);
    this.timer.unref?.();
  }
  onApplicationShutdown(): void { if (this.timer !== undefined) clearInterval(this.timer); }
  async drain(): Promise<void> {
    for (let index = 0; index < 25; index += 1) {
      if (await this.outbox.dispatchOne(reopenSlaOutboxTopic, (delivery) => this.deliver(delivery)) === 'idle') return;
    }
  }
  private async deliver(delivery: OutboxDelivery): Promise<void> {
    const payload = delivery.payload as Record<string, unknown>;
    if (typeof payload.ticketId !== 'string' || typeof payload.previousStatus !== 'string' || typeof payload.now !== 'string') throw new Error('INVALID_REOPEN_SLA_PAYLOAD');
    const ticket = await this.prisma.ticket.findUniqueOrThrow({ where: { id: payload.ticketId } });
    await this.slaTimers.apply({
      ticket: { id: ticket.id, status: ticket.status, priority: ticket.priority, serviceId: ticket.serviceId, originUnitId: ticket.originUnitId, createdAt: ticket.createdAt, firstResponseAt: ticket.firstResponseAt, resolvedAt: ticket.resolvedAt },
      previousStatus: payload.previousStatus as TicketStatus,
      now: new Date(payload.now),
      event: payload.event === 'merged' ? 'merged' : 'status_changed',
    });
  }
}
