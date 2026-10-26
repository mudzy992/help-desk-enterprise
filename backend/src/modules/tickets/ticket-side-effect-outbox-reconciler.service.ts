import { Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { TransactionalOutboxService, type OutboxDelivery } from '../../common/outbox/transactional-outbox.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TicketSlaTimersService } from '../sla/ticket-sla-timers.service';
import type { TicketStatus } from '../../generated/prisma/enums';
import { publishPersistedTicketMessages } from './publish-persisted-ticket-messages';
import { TicketRealtimeHub } from './ticket-realtime.hub';
import type { TicketRecord } from './tickets.types';
import type { TicketMessageRecord } from './collaboration.types';

export const ticketMessageDeliveryTopic = 'ticket.message.delivery';
export const ticketSlaEffectsTopic = 'ticket.sla.effects';
const intervalMs = 2_000;

@Injectable()
export class TicketSideEffectOutboxReconciler implements OnModuleInit, OnApplicationShutdown {
  private timer?: ReturnType<typeof setInterval>;
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: TransactionalOutboxService,
    private readonly realtimeHub: TicketRealtimeHub,
    private readonly slaTimers: TicketSlaTimersService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.drain().catch(() => undefined), intervalMs);
    this.timer.unref?.();
  }
  onApplicationShutdown(): void { if (this.timer !== undefined) clearInterval(this.timer); }

  async drain(): Promise<void> {
    for (let index = 0; index < 50; index += 1) {
      const message = await this.outbox.dispatchOne(ticketMessageDeliveryTopic, (delivery) => this.deliverMessage(delivery));
      const sla = await this.outbox.dispatchOne(ticketSlaEffectsTopic, (delivery) => this.deliverSla(delivery));
      if (message === 'idle' && sla === 'idle') return;
    }
  }

  private async deliverMessage(delivery: OutboxDelivery): Promise<void> {
    const payload = delivery.payload as Record<string, unknown>;
    if (typeof payload.messageId !== 'string' || typeof payload.ticketId !== 'string') throw new Error('INVALID_TICKET_MESSAGE_DELIVERY');
    const [message, ticket] = await Promise.all([
      this.prisma.ticketMessage.findUnique({ where: { id: payload.messageId } }),
      this.prisma.ticket.findUnique({ where: { id: payload.ticketId } }),
    ]);
    // Retention/deletion can legitimately remove the source before delivery.
    if (message === null || ticket === null) return;
    publishPersistedTicketMessages(this.realtimeHub, ticket as TicketRecord, [message as TicketMessageRecord]);
  }

  private async deliverSla(delivery: OutboxDelivery): Promise<void> {
    const payload = delivery.payload as Record<string, unknown>;
    if (typeof payload.ticketId !== 'string' || typeof payload.previousStatus !== 'string' || typeof payload.occurredAt !== 'string') throw new Error('INVALID_TICKET_SLA_DELIVERY');
    const ticket = await this.prisma.ticket.findUnique({ where: { id: payload.ticketId } });
    if (ticket === null) return;
    await this.slaTimers.apply({
      ticket: { id: ticket.id, status: ticket.status, priority: ticket.priority, serviceId: ticket.serviceId, originUnitId: ticket.originUnitId, createdAt: ticket.createdAt, firstResponseAt: ticket.firstResponseAt, resolvedAt: ticket.resolvedAt },
      previousStatus: payload.previousStatus as TicketStatus,
      now: new Date(payload.occurredAt),
      event: payload.priorityChanged === true && payload.statusChanged !== true ? 'priority_changed' : 'status_changed',
    });
  }
}
