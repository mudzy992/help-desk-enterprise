import type { TicketCsatRecord } from './csat/csat.types';

type TicketCsatWhere = {
  ticketId?: string | { in: readonly string[] };
};

export function createInMemoryTicketCsatDelegate(
  rows: Map<string, TicketCsatRecord>,
  nextId: () => string,
  now: () => Date,
) {
  return {
    findUnique: async ({ where }: { where: { ticketId: string } }) =>
      [...rows.values()].find((row) => row.ticketId === where.ticketId) ?? null,
    findMany: async ({ where }: { where?: TicketCsatWhere } = {}) =>
      [...rows.values()].filter((row) => matches(row, where)),
    create: async ({
      data,
    }: {
      data: Omit<TicketCsatRecord, 'id' | 'createdAt'> & { id?: string };
    }) => {
      const duplicate = [...rows.values()].some(
        (row) => row.ticketId === data.ticketId,
      );
      if (duplicate) {
        throw { code: 'P2002', meta: { target: ['ticketId'] } };
      }
      const created: TicketCsatRecord = {
        id: data.id ?? nextId(),
        ticketId: data.ticketId,
        rating: data.rating,
        comment: data.comment ?? null,
        submittedByUserId: data.submittedByUserId,
        createdAt: now(),
      };
      rows.set(created.id, created);
      return created;
    },
  };
}

function matches(row: TicketCsatRecord, where?: TicketCsatWhere): boolean {
  if (where === undefined || where.ticketId === undefined) {
    return true;
  }
  if (typeof where.ticketId === 'string') {
    return row.ticketId === where.ticketId;
  }
  return where.ticketId.in.includes(row.ticketId);
}
