import type { SlaEscalationRule } from "@/services/sla-api";

/** Loose translate adapter — avoids i18next TFunction overload crashes. */
type Translate = (key: string, options?: Record<string, string>) => string;

export function formatSlaEscalationTarget(
  rule: Pick<
    SlaEscalationRule,
    "targetRole" | "targetGroupId" | "targetUserId" | "targetOnCall"
  >,
  translate: Translate,
  groupNames: ReadonlyMap<string, string> | null,
): string {
  if (rule.targetRole) {
    const roleKey = `policyPacks.roles.${rule.targetRole}`;
    const roleLabel = translate(roleKey);
    const role = roleLabel === roleKey ? rule.targetRole : roleLabel;
    return translate("sla.escalationTargetRoleValue", { role });
  }
  if (rule.targetGroupId) {
    const groupName =
      groupNames === null
        ? translate("sla.escalationGroupLoading")
        : groupNames.get(rule.targetGroupId) ?? translate("sla.escalationGroupUnknown");
    return rule.targetOnCall
      ? translate("sla.escalationTargetOnCallValue", { group: groupName })
      : translate("sla.escalationTargetGroupValue", { group: groupName });
  }
  if (rule.targetUserId) {
    return translate("sla.escalationTargetUserValue", {
      id: rule.targetUserId,
    });
  }
  return "—";
}
