import { PrismaService } from '../../common/prisma/prisma.service';
import { assertSlaRuleIsUnique, assertSlaRuleTargetsExist } from './assert-sla-rule-constraints';
import { requireSlaRule } from './load-sla-rule';
import { assertOverrideFlagsAllowed, normalizeEvaluationOrder, normalizeSlaTargets } from './normalize-sla-rule-values';
import { changeLogActions, recordSlaChange } from './record-sla-change';
import { slaChangeLogEntityTypes } from './sla.constants';
import { toRuleSnapshot } from './to-sla-snapshots';
import type { SlaConfiguration, SlaMutationContext, SlaRuleRecord, UpdateRuleInput } from './sla.types';
import { withSlaProfileWriteLock } from './with-sla-profile-write-lock';

export async function updateSlaRule(prisma: PrismaService, ruleId: string, input: UpdateRuleInput, context: SlaMutationContext, configuration: SlaConfiguration): Promise<SlaRuleRecord> {
  const observed = await requireSlaRule(prisma, ruleId);
  return withSlaProfileWriteLock(prisma, observed.slaProfileId, async (client) => {
    const current = await requireSlaRule(client, ruleId);
    const priority = input.priority ?? current.priority;
    const targets = normalizeSlaTargets({ responseMinutes: input.responseMinutes ?? current.responseMinutes, resolutionMinutes: input.resolutionMinutes ?? current.resolutionMinutes });
    const evaluationOrder = normalizeEvaluationOrder(input.evaluationOrder ?? current.evaluationOrder);
    const organizationalUnitId = input.organizationalUnitId === undefined ? current.organizationalUnitId : input.organizationalUnitId;
    const serviceId = input.serviceId === undefined ? current.serviceId : input.serviceId;
    assertOverrideFlagsAllowed(configuration, { organizationalUnitId, serviceId });
    await assertSlaRuleTargetsExist(client, { organizationalUnitId, serviceId });
    await assertSlaRuleIsUnique(client, { slaProfileId: current.slaProfileId, priority, organizationalUnitId, serviceId, ignoreRuleId: current.id });
    const updated = await client.slaRule.update({ where: { id: ruleId }, data: { priority, responseMinutes: targets.responseMinutes, resolutionMinutes: targets.resolutionMinutes, evaluationOrder, organizationalUnitId, serviceId } });
    await recordSlaChange(client, { action: changeLogActions.update, entityType: slaChangeLogEntityTypes.rule, entityId: updated.id, reason: input.reason, before: toRuleSnapshot(current), after: toRuleSnapshot(updated), actorUserId: context.actorUserId });
    return updated;
  });
}
