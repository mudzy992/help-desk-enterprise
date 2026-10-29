import type { TranslationKey } from "@/i18n/translation-key";
import type { SlaEscalationRule } from "@/services/sla-api";

/** Loose translate adapter — avoids i18next TFunction overload crashes. */
type Translate = (key: TranslationKey, options?: Record<string, string>) => string;

export function formatSlaEscalationTarget(
  rule: Pick<SlaEscalationRule, "targetRole" | "targetGroupId" | "targetUserId" | "targetOnCall">,
  translate: Translate,
  groupNames: ReadonlyMap<string, string> | null,
): string {
  if (rule.targetRole) {
    const roleKeys = {
      USER: "policyPacks.roles.USER",
      AGENT: "policyPacks.roles.AGENT",
      ADMIN: "policyPacks.roles.ADMIN",
      SUPER_ADMIN: "policyPacks.roles.SUPER_ADMIN",
    } as const satisfies Readonly<Record<string, TranslationKey>>;
    const roleKey = (roleKeys as Readonly<Record<string, TranslationKey>>)[rule.targetRole];
    const roleLabel = roleKey === undefined ? rule.targetRole : translate(roleKey);
    const role = roleLabel === roleKey ? rule.targetRole : roleLabel;
    return translate("sla.escalationTargetRoleValue", { role });
  }
  if (rule.targetGroupId) {
    const groupName =
      groupNames === null
        ? translate("sla.escalationGroupLoading")
        : (groupNames.get(rule.targetGroupId) ?? translate("sla.escalationGroupUnknown"));
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
