import type { TicketPriority } from '../../generated/prisma/enums';
import { filterSlaRules, type RuleCreateData } from './in-memory-sla-store';
import type { SlaRuleRecord } from './sla.types';

export function createInMemoryRuleDelegate(
  rules: Map<string, SlaRuleRecord>,
  nextId: (prefix: string) => string,
  now: () => Date,
) {
  return {
    findUnique: async ({ where }: { where: { id: string } }) =>
      rules.get(where.id) ?? null,
    findMany: async ({
      where,
    }: {
      where?: { slaProfileId?: string; priority?: TicketPriority };
    } = {}) => filterSlaRules([...rules.values()], where),
    create: async ({ data }: { data: RuleCreateData }) => {
      const created: SlaRuleRecord = {
        id: nextId('rule'),
        ...data,
        createdAt: now(),
        updatedAt: now(),
      };
      rules.set(created.id, created);
      return created;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Omit<RuleCreateData, 'slaProfileId'>;
    }) => {
      const current = rules.get(where.id);
      if (current === undefined) {
        return null;
      }
      const updated: SlaRuleRecord = { ...current, ...data, updatedAt: now() };
      rules.set(where.id, updated);
      return updated;
    },
    delete: async ({ where }: { where: { id: string } }) => {
      const current = rules.get(where.id);
      rules.delete(where.id);
      return current ?? null;
    },
  };
}
