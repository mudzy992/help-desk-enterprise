import type { Prisma } from '../../../generated/prisma/client';

/**
 * Upper bound of the exact ticket total a list/inbox answer reports.
 *
 * Staging k6 (2026-09-24, 100k visible tickets): an exact
 * `SELECT COUNT(*) … WHERE <visibility>` walked the whole visible set on every
 * page request and, at 20 VUs, held pool connections long enough to exhaust the
 * pool and hit the statement timeout. Nobody pages past a few hundred pages, so
 * the total is counted up to this cap and the client shows "10 000+".
 */
export const ticketListTotalCap = 10_000;

export type CappedTicketTotal = {
  readonly total: number;
  /** `true` when there are more than `ticketListTotalCap` matching tickets. */
  readonly totalIsCapped: boolean;
};

type TicketCountClient = {
  readonly ticket: {
    count(args: { where: Prisma.TicketWhereInput; take?: number }): Promise<number>;
  };
};

/**
 * `COUNT(*)` over `SELECT … LIMIT cap + 1` — Prisma renders `count({ take })`
 * as a bounded sub-select, so Postgres stops after `cap + 1` rows.
 */
export async function countTicketsCapped(
  prisma: TicketCountClient,
  where: Prisma.TicketWhereInput,
  cap: number = ticketListTotalCap,
): Promise<CappedTicketTotal> {
  const counted = await prisma.ticket.count({ where, take: cap + 1 });
  return counted > cap
    ? { total: cap, totalIsCapped: true }
    : { total: counted, totalIsCapped: false };
}
