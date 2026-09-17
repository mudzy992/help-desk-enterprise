import { useState } from "react";
import { mapGroupsError, type GroupsErrorKey } from "@/lib/groups/map-groups-error";
import { readApiRequestId } from "@/lib/map-api-error";
import {
  deleteGroup,
  getGroup,
  updateGroup,
  type GroupResponse,
} from "@/services/groups-api";

export function useGroupsPanelActions(onChanged: () => Promise<void>) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedGroup, setExpandedGroup] = useState<GroupResponse | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<GroupsErrorKey | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);

  const loadGroup = async (groupId: string) => {
    try {
      setExpandedGroup(await getGroup(groupId));
    } catch (error) {
      setErrorKey(mapGroupsError(error));
      setRequestId(readApiRequestId(error));
    }
  };

  const openGroup = async (groupId: string) => {
    setEditingId(null);
    if (expandedId === groupId) {
      setExpandedId(null);
      setExpandedGroup(null);
      return;
    }
    setExpandedId(groupId);
    setExpandedGroup(null);
    await loadGroup(groupId);
  };

  const startEdit = (groupId: string) => {
    setEditingId(groupId);
    setExpandedId(groupId);
    void loadGroup(groupId);
  };

  const saveEdit = (input: {
    readonly name: string;
    readonly organizationalUnitId: string;
    readonly isFallback: boolean;
  }) => {
    if (editingId === null) {
      return;
    }
    const groupId = editingId;
    setPendingId(groupId);
    void updateGroup(groupId, {
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

  return {
    expandedId,
    expandedGroup,
    editingId,
    confirmDeleteId,
    pendingId,
    errorKey,
    requestId,
    openGroup,
    startEdit,
    saveEdit,
    remove,
    setConfirmDeleteId,
    setEditingId,
    setExpandedGroup,
  };
}
