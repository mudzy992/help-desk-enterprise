export type TicketFormVersionRecord = {
  readonly id: string;
  readonly serviceId: string;
  readonly formVersionId: string;
  readonly ticketNumber: string;
  readonly status: string;
};

type TicketWhere = {
  readonly formVersionId?: string;
  readonly serviceId?: string | { in: readonly string[] };
  readonly status?: { notIn: readonly string[] };
};

export function createInMemoryTicketDelegate(
  tickets: Map<string, TicketFormVersionRecord>,
  nextId: () => string,
) {
  return {
    findUnique: async ({
      where,
      select,
    }: {
      where: { id: string };
      select?: {
        id?: boolean;
        serviceId?: boolean;
        formVersionId?: boolean;
      };
    }) => {
      const record = tickets.get(where.id);
      if (record === undefined) {
        return null;
      }
      if (select === undefined) {
        return record;
      }
      return {
        ...(select.id === true ? { id: record.id } : {}),
        ...(select.serviceId === true ? { serviceId: record.serviceId } : {}),
        ...(select.formVersionId === true
          ? { formVersionId: record.formVersionId }
          : {}),
      };
    },
    count: async ({ where }: { where?: TicketWhere } = {}) =>
      [...tickets.values()].filter((item) => matchesTicket(item, where)).length,
    groupBy: async ({
      by,
      where,
      _count,
    }: {
      by: readonly ['serviceId'];
      where?: TicketWhere;
      _count: { _all: true };
    }) => {
      void by;
      void _count;
      const totals = new Map<string, number>();
      for (const item of tickets.values()) {
        if (!matchesTicket(item, where)) {
          continue;
        }
        totals.set(item.serviceId, (totals.get(item.serviceId) ?? 0) + 1);
      }
      return [...totals.entries()].map(([serviceId, total]) => ({
        serviceId,
        _count: { _all: total },
      }));
    },
    create: async ({
      data,
    }: {
      data: {
        id?: string;
        ticketNumber: string;
        serviceId: string;
        formVersionId: string;
        status?: string;
        title?: string;
        description?: string;
        priority?: string;
        impact?: string;
        urgency?: string;
        originUnitId?: string;
        requesterId?: string;
      };
    }) => {
      const created: TicketFormVersionRecord = {
        id: data.id ?? nextId(),
        ticketNumber: data.ticketNumber,
        serviceId: data.serviceId,
        formVersionId: data.formVersionId,
        status: data.status ?? 'PENDING',
      };
      tickets.set(created.id, created);
      return created;
    },
  };
}

function matchesTicket(
  item: TicketFormVersionRecord,
  where?: TicketWhere,
): boolean {
  if (where?.formVersionId !== undefined && item.formVersionId !== where.formVersionId) {
    return false;
  }
  if (where?.serviceId !== undefined) {
    if (typeof where.serviceId === 'string') {
      if (item.serviceId !== where.serviceId) {
        return false;
      }
    } else if (!where.serviceId.in.includes(item.serviceId)) {
      return false;
    }
  }
  if (
    where?.status?.notIn !== undefined &&
    where.status.notIn.includes(item.status)
  ) {
    return false;
  }
  return true;
}
