import { useCallback, useEffect, useState } from "react";
import { mapApiError, readApiRequestId, type ApiErrorKey } from "@/lib/map-api-error";
import { flattenOriginUnitOptions } from "@/lib/tickets/ticket-display";
import {
  listOrganizationalUnitTree,
  listOrganizationalUnitUsers,
  type OrganizationalUnitTreeNode,
  type OrganizationalUnitUser,
} from "@/services/organizational-units-api";

export type DirectoryUser = OrganizationalUnitUser & {
  readonly organizationalUnitPath: string;
};

export type DirectoryState = {
  readonly tree: readonly OrganizationalUnitTreeNode[];
  readonly users: readonly DirectoryUser[];
  readonly isLoading: boolean;
  readonly errorKey: ApiErrorKey | null;
  readonly requestId: string | null;
  readonly reload: () => Promise<void>;
};

/// The backend exposes members per organizational unit, so the directory is
/// assembled by walking the OU tree. No aggregate users endpoint exists yet.
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
      const loadedTree = await listOrganizationalUnitTree();
      setTree(loadedTree);
      const units = flattenOriginUnitOptions(loadedTree);
      // Unit membership is scope-checked per unit, so a unit the caller cannot
      // read contributes no members instead of failing the whole directory.
      const collected = await Promise.all(
        units.map(async (unit) =>
          (await listOrganizationalUnitUsers(unit.id).catch(() => [])).map(
            (user) => ({ ...user, organizationalUnitPath: unit.label }),
          ),
        ),
      );
      setUsers(dedupeById(collected.flat()));
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

function dedupeById(users: readonly DirectoryUser[]): readonly DirectoryUser[] {
  return [...new Map(users.map((user) => [user.id, user])).values()].sort(
    (left, right) => left.displayName.localeCompare(right.displayName),
  );
}
