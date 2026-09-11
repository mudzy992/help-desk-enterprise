import { PrismaService } from '../../common/prisma/prisma.service';
import { SlaError } from './sla.error';
import { matchesSlaRuleKey } from './normalize-sla-rule-values';
import type { SlaRuleRecord } from './sla.types';

export async function assertSlaRuleTargetsExist(
  prisma: PrismaService,
  input: {
    readonly organizationalUnitId: string | null;
    readonly serviceId: string | null;
  },
): Promise<void> {
  if (input.organizationalUnitId !== null) {
    const unit = await prisma.organizationalUnit.findUnique({
      where: { id: input.organizationalUnitId },
      select: { id: true },
    });
    if (unit === null) {
      throw new SlaError('ORGANIZATIONAL_UNIT_NOT_FOUND');
    }
  }
  if (input.serviceId !== null) {
    const service = await prisma.service.findUnique({
      where: { id: input.serviceId },
      select: { id: true },
    });
    if (service === null) {
      throw new SlaError('SERVICE_NOT_FOUND');
    }
  }
}

export async function assertSlaRuleIsUnique(
  prisma: PrismaService,
  input: {
    readonly slaProfileId: string;
    readonly priority: SlaRuleRecord['priority'];
    readonly organizationalUnitId: string | null;
    readonly serviceId: string | null;
    readonly ignoreRuleId?: string;
  },
): Promise<void> {
  const rules = await prisma.slaRule.findMany({
    where: {
      slaProfileId: input.slaProfileId,
      priority: input.priority,
    },
  });
  const conflict = rules.find(
    (rule) =>
      rule.id !== input.ignoreRuleId &&
      matchesSlaRuleKey(rule, input),
  );
  if (conflict !== undefined) {
    throw new SlaError('DUPLICATE_RULE');
  }
}
