import type { JsonValue } from '../change-log/change-log.types';
import type { SlaEscalationRuleRecord } from './ticket-sla.types';

export function toEscalationRuleSnapshot(
  rule: SlaEscalationRuleRecord,
): JsonValue {
  return {
    id: rule.id,
    slaProfileId: rule.slaProfileId,
    triggerOffsetMinutes: rule.triggerOffsetMinutes,
    targetGroupId: rule.targetGroupId,
    targetRole: rule.targetRole,
    targetUserId: rule.targetUserId,
  };
}
