import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { controlClassName, errorTextClassName, labelClassName } from "@/components/ui/control";
import type { SlaErrorKey } from "@/lib/sla/map-sla-error";
import { listGroups, type GroupListItemResponse } from "@/services/groups-api";
import { listRoles, type RoleSummaryResponse } from "@/services/rbac-api";
import type { EscalationRuleWriteInput, SlaEscalationRule } from "@/services/sla-api";
import { listUsersSummary, type UserSummary } from "@/services/users-api";
import { SlaEscalationTargetFields } from "@/components/sla/sla-escalation-target-fields";

type TargetKind = "group" | "role" | "user";

interface SlaEscalationRuleFormProperties {
  readonly rule?: SlaEscalationRule;
  readonly errorKey: SlaErrorKey | null;
  readonly isSubmitting: boolean;
  readonly onSubmit: (input: EscalationRuleWriteInput) => Promise<void>;
}

export function SlaEscalationRuleForm(props: SlaEscalationRuleFormProperties) {
  const { t } = useTranslation();
  const [targetKind, setTargetKind] = useState<TargetKind>(
    props.rule?.targetRole ? "role" : props.rule?.targetUserId ? "user" : "group",
  );
  const [triggerOffsetMinutes, setTriggerOffsetMinutes] = useState(
    String(props.rule?.triggerOffsetMinutes ?? 0),
  );
  const [targetGroupId, setTargetGroupId] = useState(props.rule?.targetGroupId ?? "");
  const [targetRole, setTargetRole] = useState(props.rule?.targetRole ?? "");
  const [targetUserId, setTargetUserId] = useState(props.rule?.targetUserId ?? "");
  const [reason, setReason] = useState("");
  const [groups, setGroups] = useState<GroupListItemResponse[]>([]);
  const [roles, setRoles] = useState<RoleSummaryResponse[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [nextGroups, nextRoles, nextUsers] = await Promise.all([
        listGroups(),
        listRoles(),
        listUsersSummary(),
      ]);
      if (cancelled) return;
      setGroups([...nextGroups]);
      setRoles([...nextRoles]);
      setUsers([...nextUsers]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await props.onSubmit({
      triggerOffsetMinutes: Number(triggerOffsetMinutes),
      targetGroupId: targetKind === "group" ? targetGroupId : "",
      targetRole: targetKind === "role" ? targetRole : "",
      targetUserId: targetKind === "user" ? targetUserId : "",
      reason,
    });
    setReason("");
  };

  return (
    <form className="grid max-w-xl gap-3" onSubmit={handleSubmit}>
      <label className={labelClassName}>
        {t("sla.triggerOffsetMinutes")}
        <input
          className={controlClassName}
          type="number"
          min={0}
          value={triggerOffsetMinutes}
          onChange={(event) => setTriggerOffsetMinutes(event.target.value)}
          required
        />
      </label>
      <SlaEscalationTargetFields
        targetKind={targetKind}
        onTargetKindChange={setTargetKind}
        groups={groups}
        roles={roles}
        users={users}
        targetGroupId={targetGroupId}
        targetRole={targetRole}
        targetUserId={targetUserId}
        onTargetGroupIdChange={setTargetGroupId}
        onTargetRoleChange={setTargetRole}
        onTargetUserIdChange={setTargetUserId}
      />
      <label className={labelClassName}>
        {t("sla.reason")}
        <input
          className={controlClassName}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          required
        />
      </label>
      {props.errorKey ? <p className={errorTextClassName}>{t(props.errorKey)}</p> : null}
      <Button type="submit" disabled={props.isSubmitting}>
        {props.isSubmitting
          ? t("sla.saving")
          : props.rule
            ? t("sla.saveEscalation")
            : t("sla.createEscalation")}
      </Button>
    </form>
  );
}
