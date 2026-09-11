import type { TicketAttachmentRecord } from './attachments/attachments.types';
import { matchesNullableField, pickInMemoryRecord } from './in-memory-record';

type AttachmentWhere = {
  readonly id?: string;
  readonly ticketId?: string;
};

export function createInMemoryTicketAttachmentDelegate(
  records: Map<string, TicketAttachmentRecord>,
  nextId: () => string,
  now: () => Date,
) {
  const matching = (where?: AttachmentWhere) =>
    [...records.values()].filter((record) => {
      if (where?.id !== undefined && record.id !== where.id) {
        return false;
      }
      return where?.ticketId === undefined || record.ticketId === where.ticketId;
    });
  return {
    count: async ({ where }: { where?: AttachmentWhere } = {}) =>
      matching(where).length,
    findMany: async ({
      where,
      orderBy,
    }: {
      where?: AttachmentWhere;
      orderBy?: { createdAt: 'asc' | 'desc' };
    } = {}) => {
      const items = matching(where);
      return orderBy?.createdAt === 'desc' ? [...items].reverse() : items;
    },
    findFirst: async ({
      where,
      select,
    }: {
      where?: AttachmentWhere;
      select?: Record<string, boolean>;
    } = {}) => pickInMemoryRecord(matching(where)[0], select),
    create: async ({
      data,
    }: {
      data: Omit<TicketAttachmentRecord, 'id' | 'createdAt' | 'updatedAt'> & {
        id?: string;
      };
    }) => {
      const created: TicketAttachmentRecord = {
        ...data,
        messageId: data.messageId ?? null,
        id: data.id ?? nextId(),
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
      data: Partial<TicketAttachmentRecord>;
    }) => {
      const current = records.get(where.id);
      if (current === undefined) {
        throw new Error('NOT_FOUND');
      }
      const updated: TicketAttachmentRecord = {
        ...current,
        ...data,
        updatedAt: now(),
      };
      records.set(updated.id, updated);
      return updated;
    },
    delete: async ({ where }: { where: { id: string } }) => {
      const current = records.get(where.id);
      if (current === undefined) {
        throw new Error('NOT_FOUND');
      }
      records.delete(where.id);
      return current;
    },
  };
}
