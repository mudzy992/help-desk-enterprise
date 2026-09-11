export type InMemoryTicketWhere = {
  id?: string | { in: readonly string[] };
  originUnitId?: string;
  serviceId?: string;
  status?: string | { in: readonly string[] } | { not: string };
  requesterId?: string;
  assignedGroupId?: string | { in: readonly string[] } | { not: null };
  assignedUserId?: string | null | { not: null };
  parentTicketId?: string | null;
  mergedIntoTicketId?: string | null;
  closedAt?: { lte: Date };
};

export type InMemoryTicketOrderBy =
  | {
      createdAt?: 'asc' | 'desc';
      updatedAt?: 'asc' | 'desc';
      id?: 'asc' | 'desc';
    }
  | ReadonlyArray<{
      createdAt?: 'asc' | 'desc';
      updatedAt?: 'asc' | 'desc';
      id?: 'asc' | 'desc';
    }>;
