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

export type DirectoryLoadResult = {
  readonly tree: readonly OrganizationalUnitTreeNode[];
  readonly users: readonly DirectoryUser[];
  readonly errorKey: ApiErrorKey | null;
  readonly requestId: string | null;
};

export async function loadDirectory(): Promise<DirectoryLoadResult> {
  const treeResult = await listOrganizationalUnitTree().then(
    (tree) => ({ ok: true as const, tree, error: null }),
    (error: unknown) => ({
      ok: false as const,
      tree: [] as const,
      error,
    }),
  );
  if (!treeResult.ok) {
    return {
      tree: [],
      users: [],
      errorKey: mapApiError(treeResult.error),
      requestId: readApiRequestId(treeResult.error),
    };
  }
  const units = flattenOriginUnitOptions(treeResult.tree);
  const collected = await Promise.all(
    units.map(async (unit) =>
      (await listOrganizationalUnitUsers(unit.id).catch(() => [])).map(
        (user) => ({ ...user, organizationalUnitPath: unit.label }),
      ),
    ),
  );
  return {
    tree: treeResult.tree,
    users: dedupeDirectoryUsers(collected.flat()),
    errorKey: null,
    requestId: null,
  };
}

export function dedupeDirectoryUsers(
  users: readonly DirectoryUser[],
): readonly DirectoryUser[] {
  return [...new Map(users.map((user) => [user.id, user])).values()].sort(
    (left, right) => left.displayName.localeCompare(right.displayName),
  );
}
