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
  readonly partialFailure: boolean;
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
      partialFailure: false,
    };
  }
  const units = flattenOriginUnitOptions(treeResult.tree);
  const results = await Promise.allSettled(
    units.map(async (unit) =>
      (await listOrganizationalUnitUsers(unit.id)).map((user) => ({
        ...user,
        organizationalUnitPath: unit.label,
      })),
    ),
  );
  const collected = results.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );
  return {
    tree: treeResult.tree,
    users: dedupeDirectoryUsers(collected),
    errorKey: null,
    requestId: null,
    partialFailure: results.some((result) => result.status === "rejected"),
  };
}

export function dedupeDirectoryUsers(users: readonly DirectoryUser[]): readonly DirectoryUser[] {
  return [...new Map(users.map((user) => [user.id, user])).values()].sort((left, right) =>
    left.displayName.localeCompare(right.displayName),
  );
}
