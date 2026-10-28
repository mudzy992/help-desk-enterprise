import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { slaRuntimeEventOutboxTopic } from './persist-ticket-sla-runtime-transitions';

export type SlaObservabilitySignal = {
  readonly transitionOutbox: { readonly pending: number; readonly failed: number; readonly oldestPendingAgeSeconds: number | null; readonly maxDeliveryLatencySecondsLastHour: number | null };
  readonly fanout: { readonly emptyLastHour: number; readonly failedLastHour: number };
  readonly scan: { readonly dueBacklog: number; readonly oldestDueAgeSeconds: number | null; readonly retryPending: number; readonly quarantined: number };
  readonly schedulerRegistered: boolean | null;
  readonly configurationDrift: number;
  readonly invalidDueBeforeStart: number;
};

type LatencyRow = { maxSeconds: number | null };
type CountRow = { total: bigint };

export async function collectSlaObservability(
  prisma: PrismaService,
  input: { readonly now: Date; readonly schedulerRegistered: boolean | null },
): Promise<SlaObservabilitySignal> {
  const hourAgo = new Date(input.now.getTime() - 3_600_000);
  const [pending, failed, oldestPending, latencyRows, emptyLastHour, failedLastHour, dueBacklog, oldestDue, retryPending, quarantined, configurationDrift, invalidDueBeforeStart] = await Promise.all([
    prisma.outboxMessage.count({ where: { topic: slaRuntimeEventOutboxTopic, status: { in: ['PENDING', 'PROCESSING'] } } }),
    prisma.outboxMessage.count({ where: { topic: slaRuntimeEventOutboxTopic, status: 'DEAD_LETTER' } }),
    prisma.outboxMessage.findFirst({ where: { topic: slaRuntimeEventOutboxTopic, status: { in: ['PENDING', 'PROCESSING'] } }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
    prisma.$queryRaw<LatencyRow[]>(Prisma.sql`SELECT MAX(EXTRACT(EPOCH FROM ("completedAt" - "createdAt")))::float8 AS "maxSeconds" FROM "OutboxMessage" WHERE "topic" = ${slaRuntimeEventOutboxTopic} AND "status" = 'SUCCEEDED' AND "completedAt" >= ${hourAgo}`),
    prisma.auditLog.count({ where: { action: 'sla.escalation.audience_empty', createdAt: { gte: hourAgo } } }),
    prisma.outboxMessage.count({ where: { topic: slaRuntimeEventOutboxTopic, status: 'DEAD_LETTER', updatedAt: { gte: hourAgo } } }),
    prisma.ticketSlaState.count({ where: { resolutionCompletedAt: null, nextDueAt: { lte: input.now } } }),
    prisma.ticketSlaState.findFirst({ where: { resolutionCompletedAt: null, nextDueAt: { lte: input.now } }, orderBy: { nextDueAt: 'asc' }, select: { nextDueAt: true } }),
    prisma.slaScanFailure.count({ where: { quarantinedAt: null } }),
    prisma.slaScanFailure.count({ where: { quarantinedAt: { not: null } } }),
    prisma.ticketSlaState.count({ where: { resolutionCompletedAt: null, OR: [{ configurationVersion: null }, { configurationSnapshot: { equals: Prisma.DbNull } }] } }),
    prisma.$queryRaw<CountRow[]>(Prisma.sql`SELECT COUNT(*)::bigint AS "total" FROM "TicketSlaState" WHERE ("responseDueAt" IS NOT NULL AND "responseDueAt" < "startedAt") OR ("resolutionDueAt" IS NOT NULL AND "resolutionDueAt" < "startedAt")`),
  ]);
  return {
    transitionOutbox: { pending, failed, oldestPendingAgeSeconds: ageSeconds(oldestPending?.createdAt ?? null, input.now), maxDeliveryLatencySecondsLastHour: latencyRows[0]?.maxSeconds ?? null },
    fanout: { emptyLastHour, failedLastHour },
    scan: { dueBacklog, oldestDueAgeSeconds: ageSeconds(oldestDue?.nextDueAt ?? null, input.now), retryPending, quarantined },
    schedulerRegistered: input.schedulerRegistered,
    configurationDrift,
    invalidDueBeforeStart: Number(invalidDueBeforeStart[0]?.total ?? 0n),
  };
}

function ageSeconds(value: Date | null, now: Date): number | null {
  return value === null ? null : Math.max(0, Math.floor((now.getTime() - value.getTime()) / 1_000));
}
