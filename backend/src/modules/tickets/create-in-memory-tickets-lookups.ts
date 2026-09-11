import { pickInMemoryFields } from '../routing/in-memory-routing-store';
import type {
  InMemoryTicketGroup,
  InMemoryTicketService,
  InMemoryTicketUnit,
  InMemoryTicketUser,
} from './in-memory-tickets-types';

export function createInMemoryTicketsLookups(input: {
  readonly units: Map<string, InMemoryTicketUnit>;
  readonly services: Map<string, InMemoryTicketService>;
  readonly groups: Map<string, InMemoryTicketGroup>;
  readonly users: Map<string, InMemoryTicketUser>;
}) {
  return {
    organizationalUnit: createKeyedLookup(input.units),
    service: createKeyedLookup(input.services),
    group: createKeyedLookup(input.groups),
    user: {
      findUnique: async ({
        where,
        select,
      }: {
        where: { id: string };
        select?: Record<string, boolean>;
      }) => pickInMemoryFields(input.users.get(where.id), select),
    },
  };
}

function createKeyedLookup<T extends { readonly id: string }>(
  records: Map<string, T>,
) {
  return {
    findUnique: async ({
      where,
      select,
    }: {
      where: { id: string };
      select?: Record<string, boolean>;
    }) => pickInMemoryFields(records.get(where.id), select),
    findMany: async ({
      where,
      select,
    }: {
      where?: { id?: { in: readonly string[] } };
      select?: Record<string, boolean>;
    } = {}) =>
      [...records.values()]
        .filter((record) =>
          where?.id === undefined ? true : where.id.in.includes(record.id),
        )
        .map((record) => pickInMemoryFields(record, select)),
  };
}
