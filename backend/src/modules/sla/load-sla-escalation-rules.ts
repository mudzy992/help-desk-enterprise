import { PrismaService } from '../../common/prisma/prisma.service';
import type { SlaEscalationRuleRecord } from './ticket-sla.types';

export async function loadSlaEscalationRules(
  prisma: PrismaService,
  slaProfileId: string | null,
): Promise<readonly SlaEscalationRuleRecord[]> {
  if (slaProfileId === null) {
    return [];
  }
  const rows = await prisma.slaEscalationRule.findMany({
    where: { slaProfileId },
    orderBy: { triggerOffsetMinutes: 'asc' },
  });
  return rows.map((row) => ({
    id: row.id,
    slaProfileId: row.slaProfileId,
    triggerOffsetMinutes: row.triggerOffsetMinutes,
    targetGroupId: row.targetGroupId,
  }));
}
