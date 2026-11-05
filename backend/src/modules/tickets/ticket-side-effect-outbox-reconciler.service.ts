import { Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { TransactionalOutboxService, type OutboxDelivery } from '../../common/outbox/transactional-outbox.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TicketSlaTimersService } from '../sla/ticket-sla-timers.service';
import type { TicketStatus } from '../../generated/prisma/enums';
import { TemplatesConfigurationLoader } from '../templates/templates-configuration.loader';
import { autoAttachPlaybook } from '../templates/ticket-playbooks/attach-playbook-to-ticket';
import { TemplatesError } from '../templates/templates.error';
import { publishPersistedTicketMessages } from './publish-persisted-ticket-messages';
import { TicketRealtimeHub } from './ticket-realtime.hub';
import type { TicketRecord } from './tickets.types';
import type { TicketMessageRecord } from './collaboration.types';
import {
  ticketMessageDeliveryTopic,
  ticketPlaybookAutoAttachTopic,
  ticketSlaEffectsTopic,
  ticketSideEffectOutboxTopics,
} from './ticket-side-effect-outbox.constants';

export {
  ticketMessageDeliveryTopic,
  ticketPlaybookAutoAttachTopic,
  ticketSlaEffectsTopic,
  ticketSideEffectOutboxTopics,
} from './ticket-side-effect-outbox.constants';

const intervalMs = 2_000;

@Injectable()
export class TicketSideEffectOutboxReconciler implements OnModuleInit, OnApplicationShutdown {
  private timer?: ReturnType<typeof setInterval>;
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: TransactionalOutboxService,
    private readonly realtimeHub: TicketRealtimeHub,
    private readonly slaTimers: TicketSlaTimersService,
    private readonly templatesConfiguration: TemplatesConfigurationLoader,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.drain().catch(() => undefined), intervalMs);
    this.timer.unref?.();
  }
  onApplicationShutdown(): void { if (this.timer !== undefined) clearInterval(this.timer); }

  async health(): Promise<{ pending: number; processing: number; deadLetter: number; oldestPendingAgeMs: number }> {
    const topic = { in: [...ticketSideEffectOutboxTopics] };
    const activeStatuses: Array<'PENDING' | 'PROCESSING'> = ['PENDING', 'PROCESSING'];
    const active = { topic, status: { in: activeStatuses } };
    const [pending, processing, deadLetter, oldest] = await Promise.all([
      this.prisma.outboxMessage.count({ where: { topic, status: 'PENDING' } }),
      this.prisma.outboxMessage.count({ where: { topic, status: 'PROCESSING' } }),
      this.prisma.outboxMessage.count({ where: { topic, status: 'DEAD_LETTER' } }),
      this.prisma.outboxMessage.findFirst({ where: active, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
    ]);
    return {
      pending,
      processing,
      deadLetter,
      oldestPendingAgeMs: oldest === null ? 0 : Math.max(0, Date.now() - oldest.createdAt.getTime()),
    };
  }

  async drain(): Promise<void> {
    for (let index = 0; index < 50; index += 1) {
      const message = await this.outbox.dispatchOne(ticketMessageDeliveryTopic, (delivery) => this.deliverMessage(delivery));
      const sla = await this.outbox.dispatchOne(ticketSlaEffectsTopic, (delivery) => this.deliverSla(delivery));
      const playbook = await this.outbox.dispatchOne(ticketPlaybookAutoAttachTopic, (delivery) => this.deliverPlaybookAutoAttach(delivery));
      if (message === 'idle' && sla === 'idle' && playbook === 'idle') return;
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

  private async deliverPlaybookAutoAttach(delivery: OutboxDelivery): Promise<void> {
    const payload = delivery.payload as Record<string, unknown>;
    if (typeof payload.ticketId !== 'string') throw new Error('INVALID_TICKET_PLAYBOOK_AUTO_ATTACH_DELIVERY');
    const ticket = await this.prisma.ticket.findUnique({ where: { id: payload.ticketId } });
    if (
      ticket === null ||
      ticket.mergedIntoTicketId !== null ||
      ticket.status === 'RESOLVED' ||
      ticket.status === 'CLOSED' ||
      ticket.status === 'ARCHIVED'
    ) {
      return;
    }
    const configuration = await this.templatesConfiguration.load();
    if (!configuration.playbooksEnabled || !configuration.autoAttach) return;
    const active = await this.prisma.ticketPlaybook.findFirst({
      where: { ticketId: ticket.id, detachedAt: null },
      select: { id: true },
    });
    if (active !== null) return;
    try {
      await autoAttachPlaybook({
        prisma: this.prisma,
        ticket: ticket as Pick<TicketRecord, 'id' | 'serviceId'>,
        messages: [],
      });
    } catch (error) {
      // A manual/synchronous attach may win after the read above, or the selected
      // playbook may stop being applicable. Both are successful reconciliation.
      if (
        error instanceof TemplatesError &&
        (error.code === 'TICKET_PLAYBOOK_ALREADY_ATTACHED' || error.code === 'TICKET_PLAYBOOK_NOT_APPLICABLE')
      ) {
        return;
      }
      throw error;
    }
  }

  private async deliverSla(delivery: OutboxDelivery): Promise<void> {
    const payload = delivery.payload as Record<string, unknown>;
    if (typeof payload.ticketId !== 'string' || typeof payload.previousStatus !== 'string' || typeof payload.occurredAt !== 'string') throw new Error('INVALID_TICKET_SLA_DELIVERY');
    if (payload.event !== undefined && payload.event !== 'agent_replied') throw new Error('INVALID_TICKET_SLA_DELIVERY');
    const ticket = await this.prisma.ticket.findUnique({ where: { id: payload.ticketId } });
    if (ticket === null) return;
    await this.slaTimers.apply({
      ticket: { id: ticket.id, status: ticket.status, priority: ticket.priority, serviceId: ticket.serviceId, originUnitId: ticket.originUnitId, createdAt: ticket.createdAt, firstResponseAt: ticket.firstResponseAt, resolvedAt: ticket.resolvedAt },
      previousStatus: payload.previousStatus as TicketStatus,
      now: new Date(payload.occurredAt),
      event: payload.event === 'agent_replied'
        ? 'agent_replied'
        : payload.priorityChanged === true && payload.statusChanged !== true
          ? 'priority_changed'
          : 'status_changed',
    });
  }
}
