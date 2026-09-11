import { PrismaService } from '../../common/prisma/prisma.service';
import {
  assertSlaRuleIsUnique,
  assertSlaRuleTargetsExist,
} from './assert-sla-rule-constraints';
import { requireSlaProfile } from './load-sla-profile';
import {
  assertOverrideFlagsAllowed,
  normalizeEvaluationOrder,
  normalizeSlaTargets,
} from './normalize-sla-rule-values';
import { changeLogActions, recordSlaChange } from './record-sla-change';
import { slaChangeLogEntityTypes } from './sla.constants';
import { SlaError } from './sla.error';
import { toRuleSnapshot } from './to-sla-snapshots';
import type {
  RuleWriteInput,
  SlaConfiguration,
  SlaMutationContext,
  SlaRuleRecord,
} from './sla.types';

export async function createSlaRule(
  prisma: PrismaService,
  input: RuleWriteInput,
  context: SlaMutationContext,
  configuration: SlaConfiguration,
): Promise<SlaRuleRecord> {
  const profile = await requireSlaProfile(prisma, input.slaProfileId);
  if (!profile.isActive) {
    throw new SlaError('PROFILE_INACTIVE');
  }
  const targets = normalizeSlaTargets(input);
  const evaluationOrder = normalizeEvaluationOrder(input.evaluationOrder);
  const organizationalUnitId = input.organizationalUnitId ?? null;
  const serviceId = input.serviceId ?? null;
  assertOverrideFlagsAllowed(configuration, {
    organizationalUnitId,
    serviceId,
  });
  await assertSlaRuleTargetsExist(prisma, { organizationalUnitId, serviceId });
  await assertSlaRuleIsUnique(prisma, {
    slaProfileId: input.slaProfileId,
    priority: input.priority,
    organizationalUnitId,
    serviceId,
  });
  return prisma.$transaction(async (transaction) => {
    const created = await transaction.slaRule.create({
      data: {
        slaProfileId: input.slaProfileId,
        priority: input.priority,
        responseMinutes: targets.responseMinutes,
        resolutionMinutes: targets.resolutionMinutes,
        evaluationOrder,
        organizationalUnitId,
        serviceId,
      },
    });
    await recordSlaChange(transaction as PrismaService, {
      action: changeLogActions.create,
      entityType: slaChangeLogEntityTypes.rule,
      entityId: created.id,
      reason: input.reason,
      before: {},
      after: toRuleSnapshot(created),
      actorUserId: context.actorUserId,
    });
    return created;
  });
}
