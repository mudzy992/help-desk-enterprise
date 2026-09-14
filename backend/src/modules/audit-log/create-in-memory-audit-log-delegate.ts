export type InMemoryAuditLogRecord = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: unknown;
  requestId: string | null;
  previousHash: string | null;
  hash: string;
  actorUserId: string | null;
  organizationalUnitId: string | null;
  createdAt: Date;
};

export function createInMemoryAuditLogDelegate(
  rows: InMemoryAuditLogRecord[],
  nextId: () => string,
  now: () => Date,
) {
  return {
    $executeRaw: async () => 1,
    auditLog: {
      findFirst: async (args: {
        readonly orderBy?: readonly {
          readonly createdAt?: 'asc' | 'desc';
          readonly id?: 'asc' | 'desc';
        }[];
        readonly select?: { readonly hash?: boolean };
      }) => {
        const sorted = [...rows].sort(compareMemoryAuditLogs);
        const descending = args.orderBy?.[0]?.createdAt === 'desc';
        const record = descending ? sorted.at(-1) : sorted[0];
        if (record === undefined) {
          return null;
        }
        if (args.select?.hash === true) {
          return { hash: record.hash };
        }
        return record;
      },
      create: async ({ data }: { data: Omit<InMemoryAuditLogRecord, 'id' | 'createdAt'> }) => {
        const created: InMemoryAuditLogRecord = {
          ...data,
          id: nextId(),
          createdAt: now(),
        };
        rows.push(created);
        return created;
      },
      findMany: async (args?: {
        readonly where?: {
          readonly OR?: readonly {
            readonly organizationalUnitId?: string | null | { in: readonly string[] };
          }[];
        };
        readonly orderBy?: readonly {
          readonly createdAt?: 'asc' | 'desc';
          readonly id?: 'asc' | 'desc';
        }[];
      }) => {
        const filtered = rows.filter((row) => matchesExportWhere(row, args?.where?.OR));
        return [...filtered].sort(compareMemoryAuditLogs);
      },
    },
  };
}

function compareMemoryAuditLogs(
  left: InMemoryAuditLogRecord,
  right: InMemoryAuditLogRecord,
): number {
  const created = left.createdAt.getTime() - right.createdAt.getTime();
  if (created !== 0) {
    return created;
  }
  return left.id.localeCompare(right.id);
}

function matchesExportWhere(
  row: InMemoryAuditLogRecord,
  clauses: readonly {
    readonly organizationalUnitId?: string | null | { in: readonly string[] };
  }[] | undefined,
): boolean {
  if (clauses === undefined || clauses.length === 0) {
    return true;
  }
  return clauses.some((clause) => {
    const filter = clause.organizationalUnitId;
    if (filter === null) {
      return row.organizationalUnitId === null;
    }
    if (typeof filter === 'object' && 'in' in filter) {
      return (
        row.organizationalUnitId !== null &&
        filter.in.includes(row.organizationalUnitId)
      );
    }
    return row.organizationalUnitId === filter;
  });
}
