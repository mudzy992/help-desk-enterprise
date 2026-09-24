import { PrismaService } from '../../../common/prisma/prisma.service';
import type { TicketListPage } from '../list-tickets';
import { respondLoadedTickets } from '../to-ticket-client-responses';
import type { TicketListResponse } from '../tickets.types';

type TicketClientLoaders = Parameters<typeof respondLoadedTickets>[2];

/** Wraps one page of records in the `{ items, total, page, pageSize }` body. */
export async function respondTicketListPage(
  prisma: PrismaService,
  page: TicketListPage,
  loaders: TicketClientLoaders,
): Promise<TicketListResponse> {
  return {
    items: await respondLoadedTickets(prisma, page.records, loaders),
    total: page.total,
    ...(page.totalIsCapped === true ? { totalIsCapped: true } : {}),
    page: page.page,
    pageSize: page.pageSize,
  };
}
