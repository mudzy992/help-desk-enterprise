export type TicketFormVersionRecord = {
  readonly id: string;
  readonly serviceId: string;
  readonly formVersionId: string;
  readonly ticketNumber: string;
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
    count: async ({
      where,
    }: {
      where?: { formVersionId?: string; serviceId?: string };
    } = {}) =>
      [...tickets.values()].filter((item) => matchesTicket(item, where)).length,
    create: async ({
      data,
    }: {
      data: {
        id?: string;
        ticketNumber: string;
        serviceId: string;
        formVersionId: string;
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
      };
      tickets.set(created.id, created);
      return created;
    },
  };
}

function matchesTicket(
  item: TicketFormVersionRecord,
  where?: { formVersionId?: string; serviceId?: string },
): boolean {
  if (where?.formVersionId !== undefined && item.formVersionId !== where.formVersionId) {
    return false;
  }
  if (where?.serviceId !== undefined && item.serviceId !== where.serviceId) {
    return false;
  }
  return true;
}
