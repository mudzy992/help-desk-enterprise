import type { SlaEscalationRuleRecord } from './ticket-sla.types';

export type EscalationRuleCreateData = {
  slaProfileId: string;
  triggerOffsetMinutes: number;
  targetGroupId?: string | null;
  targetRole?: string | null;
  targetUserId?: string | null;
};

export function createInMemorySlaEscalationRuleDelegate(
  rules: Map<string, SlaEscalationRuleRecord>,
  nextId: (prefix: string) => string,
) {
  const matchWhere = (where?: {
    slaProfileId?: string;
    id?: { not?: string };
  }): SlaEscalationRuleRecord[] =>
    [...rules.values()].filter((rule) => {
      if (
        where?.slaProfileId !== undefined &&
        rule.slaProfileId !== where.slaProfileId
      ) {
        return false;
      }
      if (where?.id?.not !== undefined && rule.id === where.id.not) {
        return false;
      }
      return true;
    });

  return {
    findMany: async ({
      where,
      orderBy,
    }: {
      where?: { slaProfileId?: string; id?: { not?: string } };
      orderBy?: { triggerOffsetMinutes: 'asc' | 'desc' };
    } = {}) => {
      const matched = matchWhere(where);
      if (orderBy?.triggerOffsetMinutes === undefined) {
        return matched;
      }
      const direction = orderBy.triggerOffsetMinutes === 'asc' ? 1 : -1;
      return matched.sort(
        (left, right) =>
          (left.triggerOffsetMinutes - right.triggerOffsetMinutes) * direction,
      );
    },
    findUnique: async ({ where }: { where: { id: string } }) =>
      rules.get(where.id) ?? null,
    count: async ({
      where,
    }: {
      where?: { slaProfileId?: string; id?: { not?: string } };
    } = {}) => matchWhere(where).length,
    create: async ({ data }: { data: EscalationRuleCreateData }) => {
      const created: SlaEscalationRuleRecord = {
        id: nextId('esc'),
        slaProfileId: data.slaProfileId,
        triggerOffsetMinutes: data.triggerOffsetMinutes,
        targetGroupId: data.targetGroupId ?? null,
        targetRole: data.targetRole ?? null,
        targetUserId: data.targetUserId ?? null,
      };
      rules.set(created.id, created);
      return { ...created, createdAt: new Date(), updatedAt: new Date() };
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<EscalationRuleCreateData>;
    }) => {
      const existing = rules.get(where.id);
      if (existing === undefined) {
        throw new Error('ESCALATION_RULE_NOT_FOUND');
      }
      const updated: SlaEscalationRuleRecord = {
        ...existing,
        triggerOffsetMinutes:
          data.triggerOffsetMinutes ?? existing.triggerOffsetMinutes,
        targetGroupId:
          data.targetGroupId === undefined
            ? existing.targetGroupId
            : (data.targetGroupId ?? null),
        targetRole:
          data.targetRole === undefined
            ? existing.targetRole
            : (data.targetRole ?? null),
        targetUserId:
          data.targetUserId === undefined
            ? existing.targetUserId
            : (data.targetUserId ?? null),
      };
      rules.set(where.id, updated);
      return { ...updated, createdAt: new Date(), updatedAt: new Date() };
    },
    delete: async ({ where }: { where: { id: string } }) => {
      const existing = rules.get(where.id);
      if (existing === undefined) {
        throw new Error('ESCALATION_RULE_NOT_FOUND');
      }
      rules.delete(where.id);
      return existing;
    },
  };
}
