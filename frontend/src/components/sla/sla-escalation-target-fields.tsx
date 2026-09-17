import { useTranslation } from "react-i18next";
import { controlClassName, labelClassName } from "@/components/ui/control";
import type { GroupListItemResponse } from "@/services/groups-api";
import type { RoleSummaryResponse } from "@/services/rbac-api";
import type { UserSummary } from "@/services/users-api";

type TargetKind = "group" | "role" | "user";

interface SlaEscalationTargetFieldsProperties {
  readonly targetKind: TargetKind;
  readonly onTargetKindChange: (value: TargetKind) => void;
  readonly groups: readonly GroupListItemResponse[];
  readonly roles: readonly RoleSummaryResponse[];
  readonly users: readonly UserSummary[];
  readonly targetGroupId: string;
  readonly targetRole: string;
  readonly targetUserId: string;
  readonly onTargetGroupIdChange: (value: string) => void;
  readonly onTargetRoleChange: (value: string) => void;
  readonly onTargetUserIdChange: (value: string) => void;
}

export function SlaEscalationTargetFields(
  props: SlaEscalationTargetFieldsProperties,
) {
  const { t } = useTranslation();
  return (
    <>
      <label className={labelClassName}>
        {t("sla.escalationTargetType")}
        <select
          className={controlClassName}
          value={props.targetKind}
          onChange={(event) =>
            props.onTargetKindChange(event.target.value as TargetKind)
          }
        >
          <option value="group">{t("sla.escalationTargetGroup")}</option>
          <option value="role">{t("sla.escalationTargetRole")}</option>
          <option value="user">{t("sla.escalationTargetUser")}</option>
        </select>
      </label>
      {props.targetKind === "group" ? (
        <label className={labelClassName}>
          {t("sla.escalationTargetGroup")}
          <select
            className={controlClassName}
            value={props.targetGroupId}
            onChange={(event) => props.onTargetGroupIdChange(event.target.value)}
            required
          >
            <option value="">{t("sla.escalationSelectTarget")}</option>
            {props.groups.map((group) => (
              <option key={group.id} value={group.id}>{group.name}</option>
            ))}
          </select>
        </label>
      ) : null}
      {props.targetKind === "role" ? (
        <label className={labelClassName}>
          {t("sla.escalationTargetRole")}
          <select
            className={controlClassName}
            value={props.targetRole}
            onChange={(event) => props.onTargetRoleChange(event.target.value)}
            required
          >
            <option value="">{t("sla.escalationSelectTarget")}</option>
            {props.roles.map((role) => (
              <option key={role.key} value={role.key}>{role.name}</option>
            ))}
          </select>
        </label>
      ) : null}
      {props.targetKind === "user" ? (
        <label className={labelClassName}>
          {t("sla.escalationTargetUser")}
          <select
            className={controlClassName}
            value={props.targetUserId}
            onChange={(event) => props.onTargetUserIdChange(event.target.value)}
            required
          >
            <option value="">{t("sla.escalationSelectTarget")}</option>
            {props.users.map((user) => (
              <option key={user.id} value={user.id}>{user.displayName}</option>
            ))}
          </select>
        </label>
      ) : null}
    </>
  );
}
