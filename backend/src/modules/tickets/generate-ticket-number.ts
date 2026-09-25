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
