import { ticketConstants } from './tickets.constants';

export function formatTicketNumber(sequence: number): string {
  return `${ticketConstants.ticketNumberPrefix}${String(sequence).padStart(
    ticketConstants.ticketNumberPad,
    '0',
  )}`;
}

/**
 * Next number = highest existing sequence + 1.
 *
 * It used to be `count(*) + 1`: after tickets were deleted (staging cleanup,
 * 2026-09-25: 100k removed, 2 kept) new tickets reused the numbers of deleted
 * ones and eventually hit the `ticketNumber` unique constraint of a kept
 * ticket. `highestSequence` returns null when it cannot answer (in-memory test
 * client), and then the old count rule applies.
 */
export async function nextTicketNumber(
  countExisting: () => Promise<number>,
  highestSequence?: () => Promise<number | null>,
): Promise<string> {
  const highest = highestSequence === undefined ? null : await highestSequence();
  const base = highest ?? (await countExisting());
  return formatTicketNumber(base + 1);
}

type RawQueryClient = {
  $queryRawUnsafe?: <T>(query: string, ...values: unknown[]) => Promise<T>;
};

/** `max(numeric suffix)` over `T-<digits>` numbers; null without raw SQL. */
export async function readHighestTicketSequence(
  client: unknown,
): Promise<number | null> {
  const raw = (client as RawQueryClient).$queryRawUnsafe;
  if (typeof raw !== 'function') {
    return null;
  }
  const prefix = ticketConstants.ticketNumberPrefix;
  // LIKE on the fixed prefix + an all-digits suffix: no regex escaping of the
  // configured prefix is needed (it contains no LIKE wildcards).
  const rows = (await raw.call(
    client,
    `SELECT COALESCE(MAX(substring("ticketNumber" FROM $1::int)::bigint), 0) AS highest
       FROM "Ticket"
      WHERE "ticketNumber" LIKE $2
        AND substring("ticketNumber" FROM $1::int) ~ '^[0-9]+$'`,
    prefix.length + 1,
    `${prefix}%`,
  )) as readonly { highest: bigint | number }[];
  return Number(rows[0]?.highest ?? 0);
}

/**
 * Review 2026-09-25: `max + 1` is read inside the create transaction, but two
 * concurrent creates (different requesters — the duplicate guardrail lock is per
 * requester + service) read the same max under READ COMMITTED and the second
 * insert hits the unique index on `ticketNumber` (P2002 → HTTP 500). Re-running
 * the whole transaction reads the new max, so a short retry is enough.
 */
export const ticketNumberCollisionAttempts = 5;

export function isTicketNumberCollision(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const candidate = error as { code?: unknown; meta?: { target?: unknown } };
  if (candidate.code !== 'P2002') {
    return false;
  }
  const target = candidate.meta?.target;
  const text = Array.isArray(target) ? target.join(',') : String(target ?? '');
  // Prisma 7 driver adapters may omit `target`; P2002 inside ticket create is
  // then still most likely the number (the only other unique key is the id).
  return text.length === 0 || text.includes('ticketNumber');
}

export async function withTicketNumberRetry<T>(
  run: () => Promise<T>,
  attempts: number = ticketNumberCollisionAttempts,
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= attempts || !isTicketNumberCollision(error)) {
        throw error;
      }
    }
  }
}
