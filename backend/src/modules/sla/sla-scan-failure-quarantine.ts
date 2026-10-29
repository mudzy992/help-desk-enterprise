import { Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export const slaScanQuarantineAttemptLimit = 3;
const retryBaseMilliseconds = 60_000;
const logger = new Logger('sla-scan');

type FailureDelegate = {
  findMany(args: unknown): Promise<readonly { ticketId: string; nextAttemptAt: Date | null; quarantinedAt: Date | null }[]>;
  findUnique(args: unknown): Promise<{ attempts: number } | null>;
  upsert(args: unknown): Promise<unknown>;
  deleteMany(args: unknown): Promise<unknown>;
};

function delegate(prisma: PrismaService): FailureDelegate | null {
  return (prisma as unknown as { slaScanFailure?: FailureDelegate }).slaScanFailure ?? null;
}

export async function loadBlockedSlaScanTicketIds(
  prisma: PrismaService,
  ticketIds: readonly string[],
  now: Date,
): Promise<ReadonlySet<string>> {
  const failures = delegate(prisma);
  if (failures === null || ticketIds.length === 0) return new Set();
  const rows = await failures.findMany({
    where: { ticketId: { in: [...ticketIds] } },
    select: { ticketId: true, nextAttemptAt: true, quarantinedAt: true },
  });
  return new Set(rows.filter((row) =>
    row.quarantinedAt !== null || (row.nextAttemptAt !== null && row.nextAttemptAt > now),
  ).map((row) => row.ticketId));
}

export async function recordSlaScanFailure(
  prisma: PrismaService,
  input: { readonly ticketId: string; readonly phase: 'scan' | 'backfill'; readonly error: unknown; readonly now: Date },
): Promise<{ readonly quarantined: boolean; readonly attempts: number }> {
  const failures = delegate(prisma);
  const message = formatError(input.error);
  if (failures === null) {
    logger.error(`sla_scan_item_failed ticket_id=${input.ticketId} phase=${input.phase} durable=false error=${message}`);
    return { quarantined: false, attempts: 1 };
  }
  const current = await failures.findUnique({ where: { ticketId: input.ticketId }, select: { attempts: true } });
  const attempts = (current?.attempts ?? 0) + 1;
  const quarantined = attempts >= slaScanQuarantineAttemptLimit;
  const delay = retryBaseMilliseconds * 2 ** Math.max(0, attempts - 1);
  await failures.upsert({
    where: { ticketId: input.ticketId },
    create: {
      ticketId: input.ticketId, phase: input.phase, attempts, lastError: message,
      lastFailedAt: input.now,
      nextAttemptAt: quarantined ? null : new Date(input.now.getTime() + delay),
      quarantinedAt: quarantined ? input.now : null,
    },
    update: {
      phase: input.phase, attempts, lastError: message, lastFailedAt: input.now,
      nextAttemptAt: quarantined ? null : new Date(input.now.getTime() + delay),
      quarantinedAt: quarantined ? input.now : null,
    },
  });
  logger.error(`sla_scan_item_failed ticket_id=${input.ticketId} phase=${input.phase} attempts=${attempts} quarantined=${quarantined} error=${message}`);
  return { quarantined, attempts };
}

export async function clearSlaScanFailure(prisma: PrismaService, ticketId: string): Promise<void> {
  const failures = delegate(prisma);
  if (failures !== null) await failures.deleteMany({ where: { ticketId } });
}

function formatError(error: unknown): string {
  const raw = error instanceof Error ? `${error.name}:${error.message}` : 'UnknownError';
  return raw.replace(/[\r\n]+/g, ' ').slice(0, 1000);
}
