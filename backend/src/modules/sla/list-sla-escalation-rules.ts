import { PrismaService } from '../../common/prisma/prisma.service';
import type { SlaEscalationRuleResponse } from './sla.types';
import type { SlaEscalationRuleRecord } from './ticket-sla.types';
import { slaProfileScopeWhere, type SlaReadScope } from './sla-read-scope';

type EscalationRuleRow = SlaEscalationRuleRecord & {
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export async function listSlaEscalationRules(
  prisma: PrismaService,
  slaProfileId: string,
  input?: { readonly scope?: SlaReadScope; readonly cursor?: string; readonly take?: number },
): Promise<{ readonly items: readonly EscalationRuleRow[]; readonly total: number; readonly hasMore: boolean; readonly nextCursor: string | null }> {
  const profileWhere = input?.scope === undefined ? undefined : slaProfileScopeWhere(input.scope);
  const where = { slaProfileId, ...(profileWhere === undefined ? {} : { slaProfile: profileWhere }) };
  const take = input?.take ?? 50;
  const [total, rawRows] = await Promise.all([
    prisma.slaEscalationRule.count({ where }),
    prisma.slaEscalationRule.findMany({
      where,
      orderBy: { id: 'asc' },
      take: take + 1,
      ...(input?.cursor === undefined ? {} : { cursor: { id: input.cursor }, skip: 1 }),
    }),
  ]);
  const rows = rawRows as EscalationRuleRow[];
  const items = rows.slice(0, take);
  const hasMore = rows.length > take;
  return { items, total, hasMore, nextCursor: hasMore ? items.at(-1)?.id ?? null : null };
}

export function toSlaEscalationRuleResponses(
  rules: readonly EscalationRuleRow[],
): readonly SlaEscalationRuleResponse[] {
  return rules.map((rule, index) => ({
    id: rule.id,
    slaProfileId: rule.slaProfileId,
    triggerOffsetMinutes: rule.triggerOffsetMinutes,
    level: index + 1,
    targetGroupId: rule.targetGroupId,
    targetRole: rule.targetRole,
    targetUserId: rule.targetUserId,
    targetOnCall: rule.targetOnCall === true,
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
  }));
}
