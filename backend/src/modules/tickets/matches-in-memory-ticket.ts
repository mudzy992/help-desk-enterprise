import { matchesInMemoryField } from './in-memory-where-operators';
import type {
  InMemoryTicketRelations,
  InMemoryTicketWhere,
} from './in-memory-ticket-where';
import type { TicketRecord } from './tickets.types';

type Row = Readonly<Record<string, unknown>>;

const noRelations: InMemoryTicketRelations = {};

/** Evaluates a Prisma-style `where` (AND/OR/NOT, scalars, relation filters). */
export function matchesInMemoryTicket(
  ticket: TicketRecord,
  where?: InMemoryTicketWhere,
  relations: InMemoryTicketRelations = noRelations,
): boolean {
  return where === undefined || matchesRow(ticket, where, relations);
}

function asList(value: unknown): readonly Row[] {
  return (Array.isArray(value) ? value : [value]) as readonly Row[];
}

function matchesRow(
  row: Row,
  where: Row,
  relations: InMemoryTicketRelations,
): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (condition === undefined) {
      return true;
    }
    if (key === 'AND') {
      return asList(condition).every((part) => matchesRow(row, part, relations));
    }
    if (key === 'OR') {
      // Like Prisma: an empty OR list matches nothing.
      return asList(condition).some((part) => matchesRow(row, part, relations));
    }
    if (key === 'NOT') {
      return !asList(condition).some((part) => matchesRow(row, part, relations));
    }
    const resolveRelated = relations[key];
    if (resolveRelated !== undefined) {
      return matchesRelation(
        resolveRelated(row as { readonly id: string }) as readonly Row[],
        condition as Row,
      );
    }
    return matchesInMemoryField(row[key], condition);
  });
}

function matchesRelation(related: readonly Row[], filter: Row): boolean {
  const unsupported = Object.keys(filter).filter(
    (key) => !['some', 'none', 'every', 'is', 'isNot'].includes(key),
  );
  if (unsupported.length > 0) {
    throw new Error(`Unsupported in-memory relation filter: ${unsupported[0]}`);
  }
  const hit = (where: unknown) =>
    related.some((item) => matchesRow(item, where as Row, noRelations));
  return (
    (filter.some === undefined || hit(filter.some)) &&
    (filter.none === undefined || !hit(filter.none)) &&
    (filter.every === undefined ||
      related.every((item) => matchesRow(item, filter.every as Row, noRelations))) &&
    (filter.is === undefined ||
      (filter.is === null ? related.length === 0 : hit(filter.is))) &&
    (filter.isNot === undefined ||
      (filter.isNot === null ? related.length > 0 : !hit(filter.isNot)))
  );
}
