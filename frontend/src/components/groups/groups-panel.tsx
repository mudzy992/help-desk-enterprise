import { Plus } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { GroupDetailSlot } from "@/components/groups/group-detail-slot";
import { GroupMutationForm } from "@/components/groups/group-mutation-form";
import { GroupUnitSection } from "@/components/groups/group-unit-section";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { DirectoryUser } from "@/lib/directory/use-directory";
import { groupGroupsByUnit } from "@/lib/groups/group-groups-by-unit";
import { useGroupsPanelActions } from "@/lib/groups/use-groups-panel-actions";
import type { OriginUnitOption } from "@/lib/tickets/ticket-display";
import type { GroupListItemResponse } from "@/services/groups-api";

interface GroupsPanelProperties {
  readonly groups: readonly GroupListItemResponse[];
  readonly routingRuleCounts: ReadonlyMap<string, number>;
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
  routingRuleCounts,
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
  const actions = useGroupsPanelActions(onChanged);
  const sections = useMemo(() => groupGroupsByUnit(groups), [groups]);

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
    <div className="fade-in grid gap-4">
      {actions.errorKey ? (
        <ApiErrorText messageKey={actions.errorKey} requestId={actions.requestId} />
      ) : null}
      {showCreateForm ? (
        <GroupMutationForm
          originUnits={originUnits}
          pending={createPending}
          onSubmit={(input) => void onSubmitCreate(input)}
          onCancel={onCancelCreate}
        />
      ) : null}
      {sections.map((section) => {
        const activeId = actions.editingId ?? actions.expandedId;
        const showDetail =
          activeId !== null && section.groups.some((group) => group.id === activeId);
        return (
          <GroupUnitSection
            key={section.organizationalUnitId}
            organizationalUnitPath={section.organizationalUnitPath}
            groups={section.groups}
            routingRuleCounts={routingRuleCounts}
            expandedId={actions.expandedId}
            canWrite={canWrite}
            confirmDeleteId={actions.confirmDeleteId}
            pendingId={actions.pendingId}
            detail={
              showDetail ? (
                <GroupDetailSlot
                  loadingLabel={t("groups.loadingDetail")}
                  originUnits={originUnits}
                  users={users}
                  canWrite={canWrite}
                  editingGroup={
                    actions.editingId === null
                      ? undefined
                      : groups.find((group) => group.id === actions.editingId)
                  }
                  expandedGroup={actions.expandedGroup}
                  isPending={actions.pendingId === actions.editingId}
                  onSaveEdit={actions.saveEdit}
                  onCancelEdit={() => actions.setEditingId(null)}
                  onMembersChanged={(updated) => {
                    actions.setExpandedGroup(updated);
                    void onChanged();
                  }}
                />
              ) : null
            }
            onOpen={(groupId) => void actions.openGroup(groupId)}
            onEdit={actions.startEdit}
            onRequestDelete={actions.setConfirmDeleteId}
            onConfirmDelete={(groupId) => void actions.remove(groupId)}
            onCancelDelete={() => actions.setConfirmDeleteId(null)}
          />
        );
      })}
    </div>
  );
}
