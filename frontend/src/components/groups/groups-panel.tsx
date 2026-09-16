import { Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { GroupMembersSection } from "@/components/groups/group-members-section";
import { GroupMutationForm } from "@/components/groups/group-mutation-form";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { DirectoryUser } from "@/lib/directory/use-directory";
import { mapGroupsError, type GroupsErrorKey } from "@/lib/groups/map-groups-error";
import { readApiRequestId } from "@/lib/map-api-error";
import type { OriginUnitOption } from "@/lib/tickets/ticket-display";
import {
  deleteGroup,
  getGroup,
  updateGroup,
  type GroupListItemResponse,
  type GroupResponse,
} from "@/services/groups-api";

interface GroupsPanelProperties {
  readonly groups: readonly GroupListItemResponse[];
  readonly originUnits: readonly OriginUnitOption[];
  readonly users: readonly DirectoryUser[];
  readonly canWrite: boolean;
  readonly onCreate: () => void;
  readonly onChanged: () => Promise<void>;
  readonly showCreateForm: boolean;
  readonly onCancelCreate: () => void;
  readonly onSubmitCreate: (input: {
    readonly name: string;
    readonly organizationalUnitId: string;
    readonly isFallback: boolean;
  }) => Promise<void>;
  readonly createPending: boolean;
}

export function GroupsPanel({
  groups,
  originUnits,
  users,
  canWrite,
  onCreate,
  onChanged,
  showCreateForm,
  onCancelCreate,
  onSubmitCreate,
  createPending,
}: GroupsPanelProperties) {
  const { t } = useTranslation();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedGroup, setExpandedGroup] = useState<GroupResponse | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<GroupsErrorKey | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);

  const openGroup = async (groupId: string) => {
    if (expandedId === groupId) {
      setExpandedId(null);
      setExpandedGroup(null);
      return;
    }
    setExpandedId(groupId);
    setExpandedGroup(null);
    try {
      setExpandedGroup(await getGroup(groupId));
    } catch (error) {
      setErrorKey(mapGroupsError(error));
      setRequestId(readApiRequestId(error));
    }
  };

  const remove = async (groupId: string) => {
    setPendingId(groupId);
    setErrorKey(null);
    setRequestId(null);
    try {
      await deleteGroup(groupId);
      setConfirmDeleteId(null);
      setExpandedId(null);
      setExpandedGroup(null);
      await onChanged();
    } catch (error) {
      setErrorKey(mapGroupsError(error));
      setRequestId(readApiRequestId(error));
    } finally {
      setPendingId(null);
    }
  };

  if (groups.length === 0 && !showCreateForm) {
    return (
      <EmptyState
        title={t("groups.emptyTitle")}
        body={t("groups.emptyBody")}
        action={
          canWrite ? (
            <Button type="button" size="sm" onClick={onCreate}>
              <Plus size={14} />
              {t("groups.create")}
            </Button>
          ) : null
        }
      />
    );
  }

  return (
    <div className="grid gap-3">
      {errorKey ? <ApiErrorText messageKey={errorKey} requestId={requestId} /> : null}
      {showCreateForm ? (
        <GroupMutationForm
          originUnits={originUnits}
          pending={createPending}
          onSubmit={(input) => void onSubmitCreate(input)}
          onCancel={onCancelCreate}
        />
      ) : null}
      {groups.map((group) => (
        <Card key={group.id} className="px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[13.5px] font-semibold text-foreground">{group.name}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {group.organizationalUnitPath}
                {group.isFallback ? ` · ${t("groups.fallbackBadge")}` : ""}
                {` · ${t("groups.memberCount", { count: group.memberCount })}`}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button type="button" size="xs" variant="outline" onClick={() => void openGroup(group.id)}>
                {expandedId === group.id ? t("groups.hideMembers") : t("groups.manageMembers")}
              </Button>
              {canWrite ? (
                <>
                  <Button type="button" size="xs" variant="outline" onClick={() => setEditingId(group.id)}>
                    {t("groups.edit")}
                  </Button>
                  {confirmDeleteId === group.id ? (
                    <>
                      <Button
                        type="button"
                        size="xs"
                        variant="danger"
                        disabled={pendingId !== null}
                        onClick={() => void remove(group.id)}
                      >
                        {pendingId === group.id ? t("groups.deleting") : t("groups.confirmDelete")}
                      </Button>
                      <Button type="button" size="xs" variant="ghost" onClick={() => setConfirmDeleteId(null)}>
                        {t("groups.cancel")}
                      </Button>
                    </>
                  ) : (
                    <Button type="button" size="xs" variant="danger" onClick={() => setConfirmDeleteId(group.id)}>
                      {t("groups.delete")}
                    </Button>
                  )}
                </>
              ) : null}
            </div>
          </div>
          {editingId === group.id ? (
            <div className="mt-3">
              <GroupMutationForm
                originUnits={originUnits}
                initial={group}
                pending={pendingId === group.id}
                onSubmit={(input) => {
                  setPendingId(group.id);
                  void updateGroup(group.id, {
                    name: input.name,
                    isFallback: input.isFallback,
                  })
                    .then(async () => {
                      setEditingId(null);
                      await onChanged();
                    })
                    .catch((error) => {
                      setErrorKey(mapGroupsError(error));
                      setRequestId(readApiRequestId(error));
                    })
                    .finally(() => setPendingId(null));
                }}
                onCancel={() => setEditingId(null)}
              />
            </div>
          ) : null}
          {expandedId === group.id && expandedGroup !== null ? (
            <GroupMembersSection
              group={expandedGroup}
              users={users}
              canWrite={canWrite}
              onChanged={(updated) => {
                setExpandedGroup(updated);
                void onChanged();
              }}
            />
          ) : null}
        </Card>
      ))}
    </div>
  );
}
