import { useState } from "react";
import type { GroupDrawerTab } from "@/components/groups/group-detail-drawer";
import { mapGroupsError, type GroupsErrorKey } from "@/lib/groups/map-groups-error";
import { readApiRequestId } from "@/lib/map-api-error";
import {
  deleteGroup,
  getGroup,
  updateGroup,
  type GroupListItemResponse,
  type GroupResponse,
} from "@/services/groups-api";

export function useGroupsPanelActions(onChanged: () => Promise<void>) {
  const [drawerGroupId, setDrawerGroupId] = useState<string | null>(null);
  const [drawerTab, setDrawerTab] = useState<GroupDrawerTab>("members");
  const [detail, setDetail] = useState<GroupResponse | null>(null);
  /** Paket 5.3.2: the danger dialog carries the name, so the row never asks twice. */
  const [deleteTarget, setDeleteTarget] =
    useState<GroupListItemResponse | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
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
      setDeleteTarget(null);
      if (drawerGroupId === target.id) {
        closeGroup();
      }
      await onChanged();
    } catch (error) {
      setErrorKey(mapGroupsError(error));
      setRequestId(readApiRequestId(error));
      setDeleteTarget(null);
    } finally {
      setPendingId(null);
    }
  };

  return {
    drawerGroupId,
    drawerTab,
    detail,
    deleteTarget,
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
    requestDelete: setDeleteTarget,
    cancelDelete: () => setDeleteTarget(null),
    confirmRemove,
  };
}
