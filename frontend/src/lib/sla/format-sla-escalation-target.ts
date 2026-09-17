import type { SlaEscalationRule } from "@/services/sla-api";

/** Loose translate adapter — avoids i18next TFunction overload crashes. */
type Translate = (key: string, options?: Record<string, string>) => string;

export function formatSlaEscalationTarget(
  rule: Pick<
    SlaEscalationRule,
    "targetRole" | "targetGroupId" | "targetUserId"
  >,
  translate: Translate,
): string {
  if (rule.targetRole) {
    const roleKey = `policyPacks.roles.${rule.targetRole}`;
    const roleLabel = translate(roleKey);
    const role = roleLabel === roleKey ? rule.targetRole : roleLabel;
    return translate("sla.escalationTargetRoleValue", { role });
  }
  if (rule.targetGroupId) {
    return translate("sla.escalationTargetGroupValue", {
      id: rule.targetGroupId,
    });
  }
  if (rule.targetUserId) {
    return translate("sla.escalationTargetUserValue", {
      id: rule.targetUserId,
    });
  }
  return "—";
}
