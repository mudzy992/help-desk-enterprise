import { useRef, useState } from "react";
import type { GroupDrawerTab } from "@/lib/ui/presentation-types";
import { mapGroupsError, type GroupsErrorKey } from "@/lib/groups/map-groups-error";
import { readApiRequestId } from "@/lib/map-api-error";
import {
  deleteGroup,
  getGroup,
  getGroupDeleteImpact,
  updateGroup,
  type GroupDeleteImpactResponse,
  type GroupListItemResponse,
  type GroupResponse,
} from "@/services/groups-api";

export type DeleteImpactState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly impact: GroupDeleteImpactResponse }
  | { readonly status: "unavailable" };

export function useGroupsPanelActions(onChanged: () => Promise<void>) {
  const [drawerGroupId, setDrawerGroupId] = useState<string | null>(null);
  const [drawerTab, setDrawerTab] = useState<GroupDrawerTab>("members");
  const [detail, setDetail] = useState<GroupResponse | null>(null);
  /** the danger dialog carries the name, so the row never asks twice. */
  const [deleteTarget, setDeleteTarget] = useState<GroupListItemResponse | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  /**
   * W2.12: the delete dialog shows what the delete would touch before the
   * operator confirms. A failed preview leaves the dialog usable, because the
   * server refuses the delete on its own.
   */
  const [deleteImpact, setDeleteImpact] = useState<DeleteImpactState>({ status: "loading" });
  /** Guards the preview against a response that arrives after another dialog. */
  const deleteImpactRequest = useRef<string | null>(null);
  const [errorKey, setErrorKey] = useState<GroupsErrorKey | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);

  const loadGroup = async (groupId: string) => {
    try {
      setDetail(await getGroup(groupId));
    } catch (error) {
      setErrorKey(mapGroupsError(error));
      setRequestId(readApiRequestId(error));
    }
  };

  const openGroup = (groupId: string, tab: GroupDrawerTab) => {
    setErrorKey(null);
    setRequestId(null);
    setDrawerGroupId(groupId);
    setDrawerTab(tab);
    setDetail(null);
    void loadGroup(groupId);
  };

  const closeGroup = () => {
    setDrawerGroupId(null);
    setDetail(null);
  };

  const saveEdit = (input: {
    readonly name: string;
    readonly organizationalUnitId: string;
    readonly isFallback: boolean;
    readonly isProblemGroup: boolean;
    readonly isCabGroup: boolean;
  }) => {
    if (drawerGroupId === null) {
      return;
    }
    const groupId = drawerGroupId;
    setPendingId(groupId);
    setErrorKey(null);
    setRequestId(null);
    void updateGroup(groupId, {
      name: input.name,
      isFallback: input.isFallback,
      isProblemGroup: input.isProblemGroup,
      isCabGroup: input.isCabGroup,
    })
      .then(async () => {
        await onChanged();
        // Stay in the drawer on the members tab: the edit is done, the useful
        // next step is the roster, not an empty form.
        setDrawerTab("members");
        await loadGroup(groupId);
      })
      .catch((error) => {
        setErrorKey(mapGroupsError(error));
        setRequestId(readApiRequestId(error));
      })
      .finally(() => setPendingId(null));
  };

  const requestDelete = (group: GroupListItemResponse) => {
    deleteImpactRequest.current = group.id;
    setDeleteTarget(group);
    setDeleteImpact({ status: "loading" });
    void getGroupDeleteImpact(group.id)
      .then((impact) => {
        // A slower response for another group must not overwrite this dialog.
        if (deleteImpactRequest.current === group.id) {
          setDeleteImpact({ status: "ready", impact });
        }
      })
      // A failed preview changes nothing: the server still refuses the delete on
      // its own, so the dialog stays usable.
      .catch(() => {
        if (deleteImpactRequest.current === group.id) {
          setDeleteImpact({ status: "unavailable" });
        }
      });
  };

  const cancelDelete = () => {
    deleteImpactRequest.current = null;
    setDeleteTarget(null);
    setDeleteImpact({ status: "loading" });
  };

  const confirmRemove = async () => {
    const target = deleteTarget;
    if (target === null) {
      return;
    }
    setPendingId(target.id);
    setErrorKey(null);
    setRequestId(null);
    try {
      await deleteGroup(target.id);
      deleteImpactRequest.current = null;
      setDeleteTarget(null);
      setDeleteImpact({ status: "loading" });
      if (drawerGroupId === target.id) {
        closeGroup();
      }
      await onChanged();
    } catch (error) {
      setErrorKey(mapGroupsError(error));
      setRequestId(readApiRequestId(error));
      setDeleteTarget(null);
      setDeleteImpact({ status: "loading" });
    } finally {
      setPendingId(null);
    }
  };

  return {
    drawerGroupId,
    drawerTab,
    detail,
    deleteTarget,
    deleteImpact,
    pendingId,
    errorKey,
    requestId,
    openGroup,
    closeGroup,
    setDrawerTab,
    saveEdit,
    onMembersChanged: (group: GroupResponse) => {
      setDetail(group);
      void onChanged();
    },
    requestDelete,
    cancelDelete,
    confirmRemove,
  };
}
