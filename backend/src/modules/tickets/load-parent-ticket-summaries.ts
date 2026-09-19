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
 * Loads display data for the parents of split child tickets in one query.
 * The title of a confidential parent is never exposed, only its number.
 */
export async function loadParentTicketSummaries(
  prisma: PrismaService,
  records: readonly Pick<TicketRecord, 'parentTicketId'>[],
): Promise<ReadonlyMap<string, ParentTicketSummary>> {
  const parentIds = [
    ...new Set(
      records
        .map((record) => record.parentTicketId)
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
