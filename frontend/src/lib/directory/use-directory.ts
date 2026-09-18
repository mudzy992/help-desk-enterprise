import { useCallback, useEffect, useState } from "react";
import { mapApiError, readApiRequestId, type ApiErrorKey } from "@/lib/map-api-error";
import {
  loadDirectory,
  type DirectoryUser,
} from "@/lib/directory/load-directory";
import type { OrganizationalUnitTreeNode } from "@/services/organizational-units-api";

export type { DirectoryUser } from "@/lib/directory/load-directory";

export type DirectoryState = {
  readonly tree: readonly OrganizationalUnitTreeNode[];
  readonly users: readonly DirectoryUser[];
  readonly isLoading: boolean;
  readonly errorKey: ApiErrorKey | null;
  readonly requestId: string | null;
  readonly reload: () => Promise<void>;
};

export function useDirectory(): DirectoryState {
  const [tree, setTree] = useState<readonly OrganizationalUnitTreeNode[]>([]);
  const [users, setUsers] = useState<readonly DirectoryUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<ApiErrorKey | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setErrorKey(null);
    setRequestId(null);
    try {
      const loaded = await loadDirectory();
      setTree(loaded.tree);
      setUsers(loaded.users);
      setErrorKey(loaded.errorKey);
      setRequestId(loaded.requestId);
    } catch (error) {
      setTree([]);
      setUsers([]);
      setErrorKey(mapApiError(error));
      setRequestId(readApiRequestId(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { tree, users, isLoading, errorKey, requestId, reload };
}
