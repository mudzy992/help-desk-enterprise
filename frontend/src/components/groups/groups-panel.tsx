import { Plus } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { GroupDetailDrawer } from "@/components/groups/group-detail-drawer";
import { GroupMutationForm } from "@/components/groups/group-mutation-form";
import { GroupUnitSection } from "@/components/groups/group-unit-section";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
    readonly isProblemGroup: boolean;
    readonly isCabGroup: boolean;
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
      {sections.map((section) => (
        <GroupUnitSection
          key={section.organizationalUnitId}
          organizationalUnitPath={section.organizationalUnitPath}
          groups={section.groups}
          routingRuleCounts={routingRuleCounts}
          expandedId={actions.drawerGroupId}
          canWrite={canWrite}
          pendingId={actions.pendingId}
          onOpenMembers={(groupId) => actions.openGroup(groupId, "members")}
          onEdit={(groupId) => actions.openGroup(groupId, "edit")}
          onRequestDelete={(groupId) => {
            const target = groups.find((group) => group.id === groupId);
            if (target !== undefined) {
              actions.requestDelete(target);
            }
          }}
        />
      ))}
      <GroupDetailDrawer
        open={actions.drawerGroupId !== null}
        onOpenChange={(open) => {
          if (!open) {
            actions.closeGroup();
          }
        }}
        tab={actions.drawerTab}
        onTabChange={actions.setDrawerTab}
        group={
          actions.drawerGroupId === null
            ? null
            : (groups.find((group) => group.id === actions.drawerGroupId) ??
              null)
        }
        detail={actions.detail}
        originUnits={originUnits}
        users={users}
        canWrite={canWrite}
        isPending={actions.pendingId === actions.drawerGroupId}
        onSaveEdit={actions.saveEdit}
        onMembersChanged={actions.onMembersChanged}
      />
      {/*
        Paket 5.3.2 (§4.3): deleting a group asks once, in the shared danger
        dialog, and names the group so the confirmation carries no ambiguity.
      */}
      <ConfirmDialog
        open={actions.deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            actions.cancelDelete();
          }
        }}
        intent="danger"
        isPending={
          actions.pendingId !== null && actions.deleteTarget?.id === actions.pendingId
        }
        title={t("groups.deleteConfirmTitle", {
          name: actions.deleteTarget?.name ?? "",
        })}
        description={t("groups.deleteConfirmBody", {
          count: actions.deleteTarget?.memberCount ?? 0,
        })}
        confirmLabel={t("groups.delete")}
        onConfirm={() => void actions.confirmRemove()}
      />
    </div>
  );
}
