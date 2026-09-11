import { pickInMemoryRecord } from '../in-memory-record';
import type { TicketApprovalRecord } from './approvals.types';

type ApprovalWhere = {
  readonly id?: string;
  readonly ticketId?: string;
  readonly status?: string;
};

export function createInMemoryTicketApprovalDelegate(
  records: Map<string, TicketApprovalRecord>,
  nextId: () => string,
  now: () => Date,
) {
  const matching = (where?: ApprovalWhere) =>
    [...records.values()].filter((record) => {
      if (where?.id !== undefined && record.id !== where.id) {
        return false;
      }
      if (where?.ticketId !== undefined && record.ticketId !== where.ticketId) {
        return false;
      }
      return where?.status === undefined || record.status === where.status;
    });
  return {
    findMany: async ({
      where,
      orderBy,
    }: {
      where?: ApprovalWhere;
      orderBy?: { stepOrder: 'asc' | 'desc' };
    } = {}) => {
      const items = matching(where);
      if (orderBy?.stepOrder === 'desc') {
        return [...items].sort((left, right) => right.stepOrder - left.stepOrder);
      }
      return [...items].sort((left, right) => left.stepOrder - right.stepOrder);
    },
    findFirst: async ({
      where,
      select,
    }: {
      where?: ApprovalWhere;
      select?: Record<string, boolean>;
    } = {}) => pickInMemoryRecord(matching(where)[0], select),
    findUnique: async ({ where }: { where: { id: string } }) =>
      records.get(where.id) ?? null,
    create: async ({
      data,
    }: {
      data: Omit<TicketApprovalRecord, 'id' | 'createdAt' | 'updatedAt'> & {
        id?: string;
        approverUserId?: string | null;
        comment?: string | null;
        decidedAt?: Date | null;
      };
    }) => {
      const created: TicketApprovalRecord = {
        ...data,
        id: data.id ?? nextId(),
        approverUserId: data.approverUserId ?? null,
        comment: data.comment ?? null,
        decidedAt: data.decidedAt ?? null,
        createdAt: now(),
        updatedAt: now(),
      };
      records.set(created.id, created);
      return created;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<TicketApprovalRecord>;
    }) => {
      const current = records.get(where.id);
      if (current === undefined) {
        throw new Error('NOT_FOUND');
      }
      const updated: TicketApprovalRecord = {
        ...current,
        ...data,
        updatedAt: now(),
      };
      records.set(updated.id, updated);
      return updated;
    },
  };
}
