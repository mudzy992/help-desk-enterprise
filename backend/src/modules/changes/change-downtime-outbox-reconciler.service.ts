import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from "@nestjs/common";
import {
  TransactionalOutboxService,
  type OutboxDelivery,
} from "../../common/outbox/transactional-outbox.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import {
  changeDowntimePendingWarningAgeMs,
  changeDowntimeReconciliationDedupeKey,
  changeDowntimeSyncMaxAttempts,
  changeDowntimeSyncTopic,
  readChangeDowntimeSyncPayload,
} from "./change-downtime-outbox";
import { ChangeScheduleService } from "./change-schedule.service";

const drainIntervalMs = 2_000;
const reconcileIntervalMs = 30_000;
const reconcileBatchSize = 100;
const reconcileBucketMs = 15 * 60_000;
const deadLetterReplayCooldownMs = 15 * 60_000;
const maxDispatchPerTick = 25;
const systemReplayActor = "change-downtime-reconciler";

export type ChangeDowntimeOutboxHealth = Readonly<{
  status: "ok" | "degraded";
  pending: number;
  processing: number;
  deadLetter: number;
  oldestPendingAgeMs: number;
}>;

/** Durable worker and drift scanner for change-owned service downtime. */
@Injectable()
export class ChangeDowntimeOutboxReconciler
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(ChangeDowntimeOutboxReconciler.name);
  private timer?: ReturnType<typeof setInterval>;
  private lastReconcileAt = 0;
  private reconciliationCursor: string | null = null;
  private draining = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: TransactionalOutboxService,
    private readonly schedule: ChangeScheduleService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.drain().catch((error: unknown) => {
        this.logger.warn(
          `change_downtime_drain_failed reason=${errorText(error)}`,
        );
      });
    }, drainIntervalMs);
    this.timer.unref?.();
    void this.drain().catch((error: unknown) => {
      this.logger.warn(
        `change_downtime_drain_failed reason=${errorText(error)}`,
      );
    });
  }

  onApplicationShutdown(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
  }

  async drain(now: Date = new Date()): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      for (let index = 0; index < maxDispatchPerTick; index += 1) {
        const result = await this.outbox.dispatchOne(
          changeDowntimeSyncTopic,
          (delivery) => this.deliver(delivery),
        );
        if (result === "idle") break;
      }
      if (now.getTime() - this.lastReconcileAt >= reconcileIntervalMs) {
        this.lastReconcileAt = now.getTime();
        await this.reconcileBatch(now);
      }
    } finally {
      this.draining = false;
    }
  }

  /** One keyset page per call; repeated worker ticks eventually cover the entire drift set. */
  async reconcileBatch(now: Date = new Date()): Promise<number> {
    const candidates = await this.prisma.changeRequest.findMany({
      where: {
        ...(this.reconciliationCursor === null
          ? {}
          : { id: { gt: this.reconciliationCursor } }),
        OR: [
          {
            status: { in: ["SCHEDULED", "IMPLEMENTING"] },
            causesDowntime: true,
          },
          { downtimeWindows: { some: { endsAt: { gt: now } } } },
        ],
      },
      select: { id: true },
      orderBy: { id: "asc" },
      take: reconcileBatchSize,
    });
    if (candidates.length === 0) {
      this.reconciliationCursor = null;
      return 0;
    }
    this.reconciliationCursor = candidates[candidates.length - 1]!.id;
    let drifted = 0;
    for (const candidate of candidates) {
      try {
        if (!(await this.schedule.hasDowntimeDrift(candidate.id))) continue;
        await this.ensureReconciliationIntent(candidate.id, now);
        drifted += 1;
      } catch (error) {
        this.logger.warn(
          `change_downtime_reconcile_failed change=${candidate.id} reason=${errorText(error)}`,
        );
        try {
          // Preserve a retryable signal when drift inspection itself is failing.
          await this.ensureReconciliationIntent(candidate.id, now);
        } catch (intentError) {
          this.logger.warn(
            `change_downtime_reconcile_intent_failed change=${candidate.id} reason=${errorText(intentError)}`,
          );
        }
      }
    }
    if (drifted > 0) this.logger.warn(`change_downtime_drift detected=${drifted}`);
    return drifted;
  }

  async health(now: Date = new Date()): Promise<ChangeDowntimeOutboxHealth> {
    const where = { topic: changeDowntimeSyncTopic };
    const [pending, processing, deadLetter, oldest] = await Promise.all([
      this.prisma.outboxMessage.count({
        where: { ...where, status: "PENDING" },
      }),
      this.prisma.outboxMessage.count({
        where: { ...where, status: "PROCESSING" },
      }),
      this.prisma.outboxMessage.count({
        where: { ...where, status: "DEAD_LETTER" },
      }),
      this.prisma.outboxMessage.findFirst({
        where: { ...where, status: { in: ["PENDING", "PROCESSING"] } },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      }),
    ]);
    const oldestPendingAgeMs =
      oldest === null
        ? 0
        : Math.max(0, now.getTime() - oldest.createdAt.getTime());
    return {
      status:
        deadLetter > 0 ||
        oldestPendingAgeMs >= changeDowntimePendingWarningAgeMs
          ? "degraded"
          : "ok",
      pending,
      processing,
      deadLetter,
      oldestPendingAgeMs,
    };
  }

  private async deliver(delivery: OutboxDelivery): Promise<void> {
    const payload = readChangeDowntimeSyncPayload(delivery.payload);
    await this.schedule.syncDowntime(
      payload.changeId,
      payload.actorUserId,
      delivery.dedupeKey,
    );
  }

  private async ensureReconciliationIntent(
    changeId: string,
    now: Date,
  ): Promise<void> {
    const payloadFilter = { path: ["changeId"], equals: changeId };
    const pending = await this.prisma.outboxMessage.findFirst({
      where: {
        topic: changeDowntimeSyncTopic,
        status: { in: ["PENDING", "PROCESSING"] },
        payload: payloadFilter,
      } as never,
      select: { id: true },
    });
    if (pending !== null) return;

    const deadLetter = await this.prisma.outboxMessage.findFirst({
      where: {
        topic: changeDowntimeSyncTopic,
        status: "DEAD_LETTER",
        payload: payloadFilter,
      } as never,
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true, lastReplayedAt: true },
    });
    if (deadLetter !== null) {
      const lastRetryAt = deadLetter.lastReplayedAt ?? deadLetter.createdAt;
      if (now.getTime() - lastRetryAt.getTime() >= deadLetterReplayCooldownMs) {
        try {
          await this.outbox.replayDeadLetter(deadLetter.id, {
            actor: systemReplayActor,
            reason: "Downtime drift detected by automatic reconciliation",
          });
        } catch (error) {
          // Another worker may have replayed the same durable command first.
          if (!isReplayConflict(error)) throw error;
        }
      }
      return;
    }

    const bucket = Math.floor(now.getTime() / reconcileBucketMs);
    await this.prisma.$transaction((transaction) =>
      this.outbox.enqueue(transaction, {
        topic: changeDowntimeSyncTopic,
        dedupeKey: changeDowntimeReconciliationDedupeKey(changeId, bucket),
        payload: { changeId, actorUserId: null },
        maxAttempts: changeDowntimeSyncMaxAttempts,
        availableAt: now,
      }),
    );
  }
}

function isReplayConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "OUTBOX_REPLAY_CONFLICT"
  );
}

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 200);
}
