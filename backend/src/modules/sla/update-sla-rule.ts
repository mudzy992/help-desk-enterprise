import { PrismaService } from '../../common/prisma/prisma.service';
import {
  assertSlaRuleIsUnique,
  assertSlaRuleTargetsExist,
} from './assert-sla-rule-constraints';
import { requireSlaRule } from './load-sla-rule';
import {
  assertOverrideFlagsAllowed,
  normalizeEvaluationOrder,
  normalizeSlaTargets,
} from './normalize-sla-rule-values';
import { changeLogActions, recordSlaChange } from './record-sla-change';
import { slaChangeLogEntityTypes } from './sla.constants';
import { toRuleSnapshot } from './to-sla-snapshots';
import type {
  SlaConfiguration,
  SlaMutationContext,
  SlaRuleRecord,
  UpdateRuleInput,
} from './sla.types';

export async function updateSlaRule(
  prisma: PrismaService,
  ruleId: string,
  input: UpdateRuleInput,
  context: SlaMutationContext,
  configuration: SlaConfiguration,
): Promise<SlaRuleRecord> {
  const current = await requireSlaRule(prisma, ruleId);
  const priority = input.priority ?? current.priority;
  const targets = normalizeSlaTargets({
    responseMinutes: input.responseMinutes ?? current.responseMinutes,
    resolutionMinutes: input.resolutionMinutes ?? current.resolutionMinutes,
  });
  const evaluationOrder = normalizeEvaluationOrder(
    input.evaluationOrder ?? current.evaluationOrder,
  );
  const organizationalUnitId =
    input.organizationalUnitId === undefined
      ? current.organizationalUnitId
      : input.organizationalUnitId;
  const serviceId =
    input.serviceId === undefined ? current.serviceId : input.serviceId;
  assertOverrideFlagsAllowed(configuration, {
    organizationalUnitId,
    serviceId,
  });
  await assertSlaRuleTargetsExist(prisma, { organizationalUnitId, serviceId });
  await assertSlaRuleIsUnique(prisma, {
    slaProfileId: current.slaProfileId,
    priority,
    organizationalUnitId,
    serviceId,
    ignoreRuleId: current.id,
  });
  return prisma.$transaction(async (transaction) => {
    const updated = await transaction.slaRule.update({
      where: { id: ruleId },
      data: {
        priority,
        responseMinutes: targets.responseMinutes,
        resolutionMinutes: targets.resolutionMinutes,
        evaluationOrder,
        organizationalUnitId,
        serviceId,
      },
    });
    await recordSlaChange(transaction as PrismaService, {
      action: changeLogActions.update,
      entityType: slaChangeLogEntityTypes.rule,
      entityId: updated.id,
      reason: input.reason,
      before: toRuleSnapshot(current),
      after: toRuleSnapshot(updated),
      actorUserId: context.actorUserId,
    });
    return updated;
  });
}
