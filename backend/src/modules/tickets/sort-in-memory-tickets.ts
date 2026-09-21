import type {
  InMemoryTicketOrderBy,
  InMemoryTicketRelations,
} from './in-memory-ticket-where';
import type { TicketRecord } from './tickets.types';

type Direction = 'asc' | 'desc';
type Key = { readonly path: readonly string[]; readonly direction: Direction };

// Postgres orders enum columns by declaration order (see enums.prisma).
const enumOrder: Readonly<Record<string, readonly string[]>> = {
  priority: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
  status: [
    'PENDING',
    'UNROUTED',
    'PENDING_APPROVAL',
    'ASSIGNED',
    'IN_PROGRESS',
    'WAITING_FOR_USER',
    'RESOLVED',
    'CLOSED',
    'ARCHIVED',
  ],
};

export function sortInMemoryTickets(
  tickets: TicketRecord[],
  orderBy?: InMemoryTicketOrderBy,
  relations: InMemoryTicketRelations = {},
): TicketRecord[] {
  const keys = toKeys(orderBy ?? { createdAt: 'desc' });
  return tickets.sort((left, right) => {
    for (const key of keys) {
      const result = compareValues(
        readValue(left, key.path, relations),
        readValue(right, key.path, relations),
        key,
      );
      if (result !== 0) {
        return result;
      }
    }
    return 0;
  });
}

function toKeys(orderBy: InMemoryTicketOrderBy): Key[] {
  const entries = Array.isArray(orderBy) ? orderBy : [orderBy];
  return entries.flatMap((entry) =>
    Object.entries(entry).flatMap(([field, value]) => flatten([field], value)),
  );
}

function flatten(path: string[], value: unknown): Key[] {
  if (value === 'asc' || value === 'desc') {
    return [{ path, direction: value }];
  }
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([field, inner]) =>
      flatten([...path, field], inner),
    );
  }
  throw new Error(`Unsupported in-memory orderBy at ${path.join('.')}`);
}

function readValue(
  ticket: TicketRecord,
  path: readonly string[],
  relations: InMemoryTicketRelations,
): unknown {
  const [head, ...rest] = path;
  const related = relations[head];
  if (related === undefined) {
    return (ticket as unknown as Record<string, unknown>)[head] ?? null;
  }
  const [row] = related(ticket) as readonly Record<string, unknown>[];
  return row === undefined ? null : (row[rest[0]] ?? null);
}

function rank(path: readonly string[], value: unknown): unknown {
  const order = path.length === 1 ? enumOrder[path[0]] : undefined;
  return order === undefined ? value : order.indexOf(value as string);
}

function compareValues(left: unknown, right: unknown, key: Key): number {
  // Postgres default: NULLs sort last ascending and first descending.
  if (left === null || right === null) {
    if (left === right) {
      return 0;
    }
    const nullFirst = key.direction === 'desc';
    return (left === null) === nullFirst ? -1 : 1;
  }
  const a = rank(key.path, left);
  const b = rank(key.path, right);
  const ordered =
    a instanceof Date && b instanceof Date
      ? a.getTime() - b.getTime()
      : typeof a === 'string' && typeof b === 'string'
        ? a.localeCompare(b)
        : Number(a) - Number(b);
  return key.direction === 'asc' ? ordered : -ordered;
}
