import { useQuery } from "@tanstack/react-query";
import type { ApiErrorKey } from "@/lib/map-api-error";
import { loadDirectory, type DirectoryUser } from "@/lib/directory/load-directory";
import type { OrganizationalUnitTreeNode } from "@/services/organizational-units-api";

export type { DirectoryUser } from "@/lib/directory/load-directory";

export type DirectoryState = {
  readonly tree: readonly OrganizationalUnitTreeNode[];
  readonly users: readonly DirectoryUser[];
  readonly isLoading: boolean;
  readonly errorKey: ApiErrorKey | null;
  readonly requestId: string | null;
  readonly partialFailure: boolean;
  readonly reload: () => Promise<void>;
};

const directoryQueryKey = ["directory", "all"] as const;

/** Shared cached directory query; the public API remains compatible for ticket consumers. */
export function useDirectory(): DirectoryState {
  const query = useQuery({
    queryKey: directoryQueryKey,
    queryFn: loadDirectory,
    staleTime: 60_000,
    retry: false,
  });
  const loaded = query.data;
  return {
    tree: loaded?.tree ?? [],
    users: loaded?.users ?? [],
    isLoading: query.isLoading,
    errorKey: loaded?.errorKey ?? null,
    requestId: loaded?.requestId ?? null,
    partialFailure: loaded?.partialFailure ?? false,
    reload: async () => {
      await query.refetch();
    },
  };
}
