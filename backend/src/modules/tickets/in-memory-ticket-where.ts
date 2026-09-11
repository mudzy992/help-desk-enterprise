export type InMemoryTicketWhere = {
  id?: string;
  originUnitId?: string;
  serviceId?: string;
  status?: string | { in: readonly string[] };
  requesterId?: string;
  assignedGroupId?: string | { in: readonly string[] } | { not: null };
  assignedUserId?: string | null | { not: null };
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
