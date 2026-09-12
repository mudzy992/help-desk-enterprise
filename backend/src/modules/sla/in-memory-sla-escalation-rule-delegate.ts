import type { SlaEscalationRuleRecord } from './ticket-sla.types';

export type EscalationRuleCreateData = {
  slaProfileId: string;
  triggerOffsetMinutes: number;
  targetGroupId?: string | null;
};

export function createInMemorySlaEscalationRuleDelegate(
  rules: Map<string, SlaEscalationRuleRecord>,
  nextId: (prefix: string) => string,
) {
  return {
    findMany: async ({
      where,
      orderBy,
    }: {
      where?: { slaProfileId?: string };
      orderBy?: { triggerOffsetMinutes: 'asc' | 'desc' };
    } = {}) => {
      const matched = [...rules.values()].filter((rule) =>
        where?.slaProfileId === undefined
          ? true
          : rule.slaProfileId === where.slaProfileId,
      );
      if (orderBy?.triggerOffsetMinutes === undefined) {
        return matched;
      }
      const direction = orderBy.triggerOffsetMinutes === 'asc' ? 1 : -1;
      return matched.sort(
        (left, right) =>
          (left.triggerOffsetMinutes - right.triggerOffsetMinutes) * direction,
      );
    },
    create: async ({ data }: { data: EscalationRuleCreateData }) => {
      const created: SlaEscalationRuleRecord = {
        id: nextId('esc'),
        slaProfileId: data.slaProfileId,
        triggerOffsetMinutes: data.triggerOffsetMinutes,
        targetGroupId: data.targetGroupId ?? null,
      };
      rules.set(created.id, created);
      return created;
    },
  };
}
