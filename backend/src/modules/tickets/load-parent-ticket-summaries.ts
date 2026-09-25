import { PrismaService } from '../../common/prisma/prisma.service';
import type { TicketRecord } from './tickets.types';

export type ParentTicketSummary = {
  readonly ticketNumber: string;
  readonly title: string | null;
};

type ParentTicketRow = Pick<
  TicketRecord,
  'id' | 'ticketNumber' | 'title' | 'isConfidential'
>;

/**
 * Loads display data for the parents of split and merged child tickets in one query.
 * The title of a confidential parent is never exposed, only its number.
 */
export async function loadParentTicketSummaries(
  prisma: PrismaService,
  records: readonly Pick<TicketRecord, 'parentTicketId' | 'mergedIntoTicketId'>[],
): Promise<ReadonlyMap<string, ParentTicketSummary>> {
  const parentIds = [
    ...new Set(
      // Package 1.2: merge parents come from the same query (no extra round trip).
      records
        .flatMap((record) => [record.parentTicketId, record.mergedIntoTicketId])
        .filter((id): id is string => id !== null && id.length > 0),
    ),
  ];
  if (parentIds.length === 0) {
    return new Map();
  }
  const parents = (await prisma.ticket.findMany({
    where: { id: { in: parentIds } },
    select: {
      id: true,
      ticketNumber: true,
      title: true,
      isConfidential: true,
    },
  })) as ParentTicketRow[];
  return new Map(
    parents.map((parent) => [
      parent.id,
      {
        ticketNumber: parent.ticketNumber,
        title: parent.isConfidential ? null : parent.title,
      },
    ]),
  );
}
