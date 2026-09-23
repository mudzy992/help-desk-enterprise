import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Button } from "@/components/ui/button";
import { controlCompactClassName } from "@/components/ui/control";
import type { DirectoryUser } from "@/lib/directory/use-directory";
import { mapGroupsError, type GroupsErrorKey } from "@/lib/groups/map-groups-error";
import { readApiRequestId } from "@/lib/map-api-error";
import { useUserRoleScopeSummaries } from "@/lib/users/use-user-role-scope-summaries";
import {
  addGroupMember,
  removeGroupMember,
  type GroupResponse,
} from "@/services/groups-api";

interface GroupMembersSectionProperties {
  readonly group: GroupResponse;
  readonly users: readonly DirectoryUser[];
  readonly canWrite: boolean;
  readonly onChanged: (group: GroupResponse) => void;
}

export function GroupMembersSection({
  group,
  users,
  canWrite,
  onChanged,
}: GroupMembersSectionProperties) {
  const { t } = useTranslation();
  const [selectedUserId, setSelectedUserId] = useState("");
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<GroupsErrorKey | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const availableUsers = users.filter(
    (user) => !group.members.some((member) => member.userId === user.id),
  );
  const availableUserIds = useMemo(
    () => availableUsers.map((user) => user.id),
    [availableUsers],
  );
  const roleScopeSummaries = useUserRoleScopeSummaries(availableUserIds);

  const mutate = async (operation: () => Promise<GroupResponse>) => {
    setErrorKey(null);
    setRequestId(null);
    try {
      const updated = await operation();
      onChanged(updated);
    } catch (error) {
      setErrorKey(mapGroupsError(error));
      setRequestId(readApiRequestId(error));
    }
  };

  return (
    <div className="grid gap-2 border-t border-border/70 pt-3">
      <p className="text-[12px] font-semibold text-foreground">
        {t("groups.members.heading")}
      </p>
      {errorKey ? <ApiErrorText messageKey={errorKey} requestId={requestId} /> : null}
      {group.members.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">{t("groups.members.empty")}</p>
      ) : (
        <ul className="grid gap-1">
          {group.members.map((member) => (
            <li
              key={member.id}
              className="flex items-center justify-between gap-2 rounded-lg bg-elevated/40 px-2 py-1.5 text-[12px]"
            >
              <span>
                {member.displayName}
                <span className="ml-1 text-muted-foreground">({member.email})</span>
              </span>
              {canWrite ? (
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  disabled={pendingUserId !== null}
                  onClick={() => {
                    setPendingUserId(member.userId);
                    void mutate(() => removeGroupMember(group.id, member.userId)).finally(
                      () => setPendingUserId(null),
                    );
                  }}
                >
                  {pendingUserId === member.userId
                    ? t("groups.members.removing")
                    : t("groups.members.remove")}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canWrite ? (
        <div className="flex flex-wrap items-center gap-2">
          <select
            className={`${controlCompactClassName} min-w-48`}
            value={selectedUserId}
            onChange={(event) => setSelectedUserId(event.target.value)}
            aria-label={t("groups.members.addSelect")}
          >
            <option value="">{t("groups.members.addSelect")}</option>
            {availableUsers.map((user) => {
              const roleScopeSummary = roleScopeSummaries.get(user.id);
              const scopeLabel =
                roleScopeSummary !== undefined && roleScopeSummary.length > 0
                  ? roleScopeSummary
                  : user.organizationalUnitPath;
              return (
                <option key={user.id} value={user.id}>
                  {user.displayName} · {scopeLabel}
                </option>
              );
            })}
          </select>
          <Button
            type="button"
            size="xs"
            disabled={selectedUserId.length === 0 || pendingUserId !== null}
            onClick={() => {
              setPendingUserId(selectedUserId);
              void mutate(() => addGroupMember(group.id, selectedUserId))
                .then(() => setSelectedUserId(""))
                .finally(() => setPendingUserId(null));
            }}
          >
            {pendingUserId === selectedUserId
              ? t("groups.members.adding")
              : t("groups.members.add")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
