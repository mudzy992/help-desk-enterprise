import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionalOutboxService } from '../outbox/transactional-outbox.service';
import type { JsonValue } from '../../modules/change-log/change-log.types';
import type { AuditLogWriteClient, RecordAuditEntryInput } from '../../modules/audit-log/audit-log.types';
import type { Prisma } from '../../generated/prisma/client';
import { appendAuditLog } from '../../modules/audit-log/append-audit-log';
import {
  defaultPrivilegedAuditKey,
  isPrivilegedAuditKey,
  privilegedAuditMaxAttempts,
  privilegedAuditPendingWarningMs,
  privilegedAuditTopic,
  readPrivilegedAuditPayload,
  toAuditEntryInput,
  toPrivilegedAuditPayload,
  type PrivilegedAuditDeliveryOutcome,
  type PrivilegedAuditIntent,
  type PrivilegedAuditRecordInput,
} from './privileged-audit.outbox';

const drainIntervalMs = 2_000;
const deliveryBatchSize = 25;
const deliveryTransactionTimeoutMs = 20_000;

export type PrivilegedAuditHealth = Readonly<{
  status: 'ok' | 'degraded';
  pending: number;
  processing: number;
  deadLetter: number;
  oldestPendingAgeMs: number;
  /** True when an intent is older than the warning window (the alarm condition). */
  stale: boolean;
}>;

/*
  W2.24 (`BA-security-03`): the single writer for privileged authentication audit
  events.

  Contract:
    * `record` / `recordWithinTransaction` never throw — a privileged action is
      not failed by an audit problem, but the event is never dropped silently
      either: it is committed as a durable intent and reported as `pending`;
    * `recordWithinTransaction` writes the intent on the caller's transaction, so
      the intent and the mutation it describes commit or disappear together;
    * delivery writes the audit entry and the outbox completion in one
      transaction (`dispatchOneTransactionally`), which is what makes a replay
      produce **exactly one** entry instead of "at least one";
    * a timer drains pending intents with the outbox backoff, and `health()`
      makes stuck or dead-lettered intents visible to an operator.
*/

@Injectable()
export class PrivilegedAuditService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(PrivilegedAuditService.name);
  private timer?: ReturnType<typeof setInterval>;
  private draining = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: TransactionalOutboxService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.drain().catch((error: unknown) => {
        this.logger.warn(`privileged_audit_drain_failed reason=${describeError(error)}`);
      });
    }, drainIntervalMs);
    this.timer.unref?.();
  }

  onApplicationShutdown(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
  }

  /**
   * The standalone path (no enclosing transaction): the intent is committed
   * first, then delivery is attempted immediately. In the healthy case the audit
   * entry lands before this resolves; in the failing case the caller learns that
   * the event is `pending` instead of believing it was journalled.
   */
  async record(input: PrivilegedAuditRecordInput): Promise<PrivilegedAuditDeliveryOutcome> {
    const dedupeKey = this.keyFor(input);
    try {
      await this.prisma.$transaction((transaction) =>
        this.outbox.enqueue(transaction, {
          topic: privilegedAuditTopic,
          dedupeKey,
          payload: toPrivilegedAuditPayload(input),
          maxAttempts: privilegedAuditMaxAttempts,
        }),
      );
    } catch (error) {
      // The database that holds the outbox is the database that holds the audit
      // table; if even the intent cannot be written, nothing else in the request
      // worked either. Say so instead of pretending.
      this.logger.error(
        `privileged_audit_intent_failed action=${input.action} reason=${describeError(error)}`,
      );
      return 'unavailable';
    }
    await this.drain(deliveryBatchSize / 5);
    const status = await this.statusOf(dedupeKey);
    return status === 'SUCCEEDED' ? 'delivered' : 'pending';
  }

  /**
   * The transactional path: the intent joins the caller's transaction (so it is
   * either committed with the mutation or rolled back with it), and delivery is
   * attempted right after commit by {@link deliverPending}. A caller that never
   * calls it is still covered — the timer picks the intent up.
   */
  async recordWithinTransaction(
    transaction: Prisma.TransactionClient,
    input: PrivilegedAuditRecordInput,
  ): Promise<{ readonly dedupeKey: string }> {
    const dedupeKey = this.keyFor(input);
    await this.outbox.enqueue(transaction, {
      topic: privilegedAuditTopic,
      dedupeKey,
      payload: toPrivilegedAuditPayload(input),
      maxAttempts: privilegedAuditMaxAttempts,
    });
    return { dedupeKey };
  }

  /** Attempts immediate delivery of whatever is pending; safe to call at any time. */
  async deliverPending(limit = 3): Promise<void> {
    await this.drain(limit);
  }

  /** Delivery loop; the timer calls it, tests call it directly. */
  async drain(limit = deliveryBatchSize): Promise<number> {
    if (this.draining) return 0;
    this.draining = true;
    let delivered = 0;
    try {
      for (let index = 0; index < Math.max(1, limit); index += 1) {
        const result = await this.outbox.dispatchOneTransactionally(
          privilegedAuditTopic,
          (delivery, transaction) => this.deliver(delivery.payload, transaction),
          { timeoutMs: deliveryTransactionTimeoutMs },
        );
        if (result === 'idle') break;
        if (result === 'succeeded') {
          delivered += 1;
          continue;
        }
        if (result === 'dead-letter') {
          // An intent that exhausted its attempts is a forensic gap; an operator
          // has to see it, and `health()` keeps reporting it until it is replayed.
          this.logger.warn('privileged_audit_dead_letter action=audit_privileged_delivery');
        }
      }
      return delivered;
    } finally {
      this.draining = false;
    }
  }

  async health(now: Date = new Date()): Promise<PrivilegedAuditHealth> {
    const topic = privilegedAuditTopic;
    const [pending, processing, deadLetter, oldest] = await Promise.all([
      this.prisma.outboxMessage.count({ where: { topic, status: 'PENDING' } }),
      this.prisma.outboxMessage.count({ where: { topic, status: 'PROCESSING' } }),
      this.prisma.outboxMessage.count({ where: { topic, status: 'DEAD_LETTER' } }),
      this.prisma.outboxMessage.findFirst({
        where: { topic, status: { in: ['PENDING', 'PROCESSING'] } },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
    ]);
    const oldestPendingAgeMs =
      oldest === null ? 0 : Math.max(0, now.getTime() - oldest.createdAt.getTime());
    const stale = pending + processing > 0 && oldestPendingAgeMs >= privilegedAuditPendingWarningMs;
    return {
      status: stale || deadLetter > 0 ? 'degraded' : 'ok',
      pending,
      processing,
      deadLetter,
      oldestPendingAgeMs,
      stale,
    };
  }

  private keyFor(input: PrivilegedAuditRecordInput): string {
    const dedupeKey = input.dedupeKey ?? defaultPrivilegedAuditKey(input);
    if (!isPrivilegedAuditKey(dedupeKey)) {
      throw new Error('PRIVILEGED_AUDIT_KEY_INVALID');
    }
    return dedupeKey;
  }

  private async statusOf(dedupeKey: string): Promise<string | null> {
    const row = await this.prisma.outboxMessage.findUnique({
      where: { topic_dedupeKey: { topic: privilegedAuditTopic, dedupeKey } },
      select: { status: true },
    });
    return row?.status ?? null;
  }

  /**
   * The only place a privileged audit entry is written.
   *
   * `appendAuditLog`, not `recordAuditEntry`: the delivery already owns the
   * transaction that will also mark the intent `SUCCEEDED`, and opening a nested
   * transaction inside it is exactly what must not happen. The chain append and
   * the completion are therefore the same commit.
   */
  private async deliver(
    payload: JsonValue,
    transaction: AuditLogWriteClient,
  ): Promise<void> {
    const intent: PrivilegedAuditIntent = readPrivilegedAuditPayload(payload);
    const input: RecordAuditEntryInput = toAuditEntryInput(intent);
    await appendAuditLog(transaction, input);
  }
}

function describeError(error: unknown): string {
  const value = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return value.slice(0, 300);
}
