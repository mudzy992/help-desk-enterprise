import { PrismaService } from '../../common/prisma/prisma.service';
import { assertSlaRuleIsUnique, assertSlaRuleTargetsExist } from './assert-sla-rule-constraints';
import { requireSlaProfile } from './load-sla-profile';
import { assertOverrideFlagsAllowed, normalizeEvaluationOrder, normalizeSlaTargets } from './normalize-sla-rule-values';
import { changeLogActions, recordSlaChange } from './record-sla-change';
import { slaChangeLogEntityTypes } from './sla.constants';
import { SlaError } from './sla.error';
import { toRuleSnapshot } from './to-sla-snapshots';
import type { RuleWriteInput, SlaConfiguration, SlaMutationContext, SlaRuleRecord } from './sla.types';
import { withSlaProfileWriteLock } from './with-sla-profile-write-lock';

export async function createSlaRule(prisma: PrismaService, input: RuleWriteInput, context: SlaMutationContext, configuration: SlaConfiguration): Promise<SlaRuleRecord> {
  return withSlaProfileWriteLock(prisma, input.slaProfileId, async (client) => {
    const profile = await requireSlaProfile(client, input.slaProfileId);
    if (!profile.isActive) throw new SlaError('PROFILE_INACTIVE');
    const targets = normalizeSlaTargets(input);
    const evaluationOrder = normalizeEvaluationOrder(input.evaluationOrder);
    const organizationalUnitId = input.organizationalUnitId ?? null;
    const serviceId = input.serviceId ?? null;
    assertOverrideFlagsAllowed(configuration, { organizationalUnitId, serviceId });
    await assertSlaRuleTargetsExist(client, { organizationalUnitId, serviceId });
    await assertSlaRuleIsUnique(client, { slaProfileId: input.slaProfileId, priority: input.priority, organizationalUnitId, serviceId });
    const created = await client.slaRule.create({ data: {
      slaProfileId: input.slaProfileId, priority: input.priority,
      responseMinutes: targets.responseMinutes, resolutionMinutes: targets.resolutionMinutes,
      evaluationOrder, organizationalUnitId, serviceId,
    } });
    await recordSlaChange(client, { action: changeLogActions.create, entityType: slaChangeLogEntityTypes.rule, entityId: created.id, reason: input.reason, before: {}, after: toRuleSnapshot(created), actorUserId: context.actorUserId });
    return created;
  });
}
