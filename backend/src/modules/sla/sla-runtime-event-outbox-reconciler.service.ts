import { Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { TransactionalOutboxService, type OutboxDelivery } from '../../common/outbox/transactional-outbox.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { JsonValue } from '../change-log/change-log.types';
import type { TicketSlaRuntimeEventIntent } from './emit-ticket-sla-runtime-events';
import { slaRuntimeEventOutboxTopic } from './persist-ticket-sla-runtime-transitions';
import { recordTicketSlaRuntimeEvent } from './record-ticket-sla-runtime-event';
import type { TicketSlaStateRecord } from './ticket-sla.types';

const drainIntervalMs = 2_000;

@Injectable()
export class SlaRuntimeEventOutboxReconciler implements OnModuleInit, OnApplicationShutdown {
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: TransactionalOutboxService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.drain().catch(() => undefined), drainIntervalMs);
    this.timer.unref?.();
  }

  onApplicationShutdown(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
  }

  async drain(): Promise<void> {
    for (let index = 0; index < 50; index += 1) {
      if (await this.outbox.dispatchOne(slaRuntimeEventOutboxTopic, (delivery) => this.deliver(delivery)) === 'idle') return;
    }
  }

  async deliver(delivery: OutboxDelivery): Promise<void> {
    const event = parseIntent(delivery.payload);
    const delivered = await this.prisma.ticketMessage.findUnique({
      where: { ticketId_idempotencyKey: { ticketId: event.ticketId, idempotencyKey: delivery.id } },
      select: { id: true },
    });
    if (delivered !== null) return;
    await this.prisma.$transaction(async (transaction) => {
      await recordTicketSlaRuntimeEvent(transaction as unknown as PrismaService, {
        ...event,
        idempotencyKey: delivery.id,
      });
    });
  }
}

function parseIntent(payload: JsonValue): TicketSlaRuntimeEventIntent {
  if (payload === null || Array.isArray(payload) || typeof payload !== 'object') throw new Error('INVALID_SLA_RUNTIME_EVENT');
  const value = payload as Record<string, JsonValue>;
  if (typeof value.ticketId !== 'string' || typeof value.reason !== 'string' || typeof value.action !== 'string') {
    throw new Error('INVALID_SLA_RUNTIME_EVENT');
  }
  return {
    ticketId: value.ticketId,
    reason: value.reason,
    action: value.action,
    before: parseState(value.before),
    after: parseState(value.after),
    ...(value.escalationRuleId === null || typeof value.escalationRuleId === 'string'
      ? { escalationRuleId: value.escalationRuleId }
      : {}),
    ...(isJsonRecord(value.extraAfter) ? { extraAfter: value.extraAfter } : {}),
  };
}

function parseState(value: JsonValue | undefined): TicketSlaStateRecord {
  if (!isJsonRecord(value) || typeof value.id !== 'string' || typeof value.ticketId !== 'string') {
    throw new Error('INVALID_SLA_RUNTIME_EVENT_STATE');
  }
  const dateKeys = [
    'startedAt', 'responseDueAt', 'resolutionDueAt', 'respondedAt',
    'resolutionCompletedAt', 'pausedAt', 'nextDueAt', 'updatedAt',
  ] as const;
  const revived: Record<string, unknown> = { ...value };
  for (const key of dateKeys) {
    const field = value[key];
    revived[key] = field === null ? null : typeof field === 'string' ? new Date(field) : field;
  }
  return revived as TicketSlaStateRecord;
}

function isJsonRecord(value: JsonValue | undefined): value is { readonly [key: string]: JsonValue } {
  return value !== undefined && value !== null && !Array.isArray(value) && typeof value === 'object';
}
