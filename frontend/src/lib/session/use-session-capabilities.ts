import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { queryKeys } from "@/lib/query/query-keys";
import type { PermissionKey, RoleKey } from "@/lib/session/permission-keys";
import { useSession } from "@/lib/session/use-session";
import { getCurrentSession, type CurrentSessionResponse } from "@/services/session-api";

/** Permissions change rarely; a screen that mounts later reuses the answer. */
export const currentSessionStaleTimeMs = 5 * 60_000;

export type SessionCapabilities = {
  readonly session: CurrentSessionResponse | null;
  /** True only before the first answer for this user; refreshes never set it. */
  readonly isLoading: boolean;
  readonly retry: () => void;
  readonly hasPermission: (permission: PermissionKey) => boolean;
  readonly hasRole: (role: RoleKey) => boolean;
};

export function useSessionCapabilities(): SessionCapabilities {
  const { session: storedSession } = useSession();
  const subjectId = storedSession?.principal.subjectId ?? null;

  const query = useQuery({
    queryKey: queryKeys.currentSession(subjectId ?? ""),
    queryFn: getCurrentSession,
    enabled: subjectId !== null,
    staleTime: currentSessionStaleTimeMs,
  });

  const session = subjectId === null ? null : (query.data ?? null);
  const { refetch } = query;

  const hasPermission = useCallback(
    (permission: PermissionKey) => session?.permissionKeys.includes(permission) ?? false,
    [session],
  );

  const hasRole = useCallback(
    (role: RoleKey) => session?.roleKeys.includes(role) ?? false,
    [session],
  );

  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);

  return {
    session,
    isLoading: subjectId !== null && query.isPending,
    retry,
    hasPermission,
    hasRole,
  };
}
