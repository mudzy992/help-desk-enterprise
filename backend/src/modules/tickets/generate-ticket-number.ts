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
  reservedSequence: number | null = null,
): Promise<string> {
  if (reservedSequence !== null) {
    return formatTicketNumber(reservedSequence);
  }
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

export const ticketNumberSequenceName = 'ticket_number_seq';

/**
 * Review 2026-09-25 (S5): numbers come from a Postgres sequence
 * (migration 20260925100000_ticket_number_sequence) instead of `max + 1`, which
 * scanned every ticket number and raced between concurrent creates. `nextval`
 * runs outside the create transaction on purpose: it is not transactional
 * anyway, and a missing sequence (migration not applied yet) must not abort the
 * transaction. Returns null when the sequence is unavailable — callers then
 * fall back to `max + 1`. Gaps after a rolled-back create are expected.
 */
export async function reserveTicketSequence(
  client: unknown,
): Promise<number | null> {
  const raw = (client as RawQueryClient).$queryRawUnsafe;
  if (typeof raw !== 'function') {
    return null;
  }
  try {
    const rows = (await raw.call(
      client,
      `SELECT nextval('${ticketNumberSequenceName}') AS value`,
    )) as readonly { value: bigint | number }[];
    const value = Number(rows[0]?.value);
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

/**
 * After a collision (rows inserted with explicit numbers, e.g. the seed script)
 * move the sequence past the highest existing number so the retry succeeds.
 */
export async function resyncTicketSequence(client: unknown): Promise<void> {
  const raw = (client as RawQueryClient).$queryRawUnsafe;
  if (typeof raw !== 'function') {
    return;
  }
  const highest = await readHighestTicketSequence(client);
  if (highest === null || highest < 1) {
    return;
  }
  try {
    await raw.call(
      client,
      `SELECT setval('${ticketNumberSequenceName}', GREATEST($1::bigint, (SELECT last_value FROM ${ticketNumberSequenceName})))`,
      highest,
    );
  } catch {
    // sequence missing: the max + 1 fallback is in use
  }
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
  onCollision?: () => Promise<void>,
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= attempts || !isTicketNumberCollision(error)) {
        throw error;
      }
      await onCollision?.();
    }
  }
}
