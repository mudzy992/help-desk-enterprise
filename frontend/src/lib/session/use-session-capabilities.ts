import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/lib/session/use-session";
import type { PermissionKey, RoleKey } from "@/lib/session/permission-keys";
import {
  getCurrentSession,
  type CurrentSessionResponse,
} from "@/services/session-api";

export type SessionCapabilities = {
  readonly session: CurrentSessionResponse | null;
  readonly isLoading: boolean;
  readonly hasPermission: (permission: PermissionKey) => boolean;
  readonly hasRole: (role: RoleKey) => boolean;
};

export function useSessionCapabilities(): SessionCapabilities {
  const { session: storedSession } = useSession();
  const accessToken = storedSession?.accessToken ?? null;
  const [session, setSession] = useState<CurrentSessionResponse | null>(null);
  const [isLoading, setIsLoading] = useState(accessToken !== null);

  useEffect(() => {
    if (accessToken === null) {
      setSession(null);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    void getCurrentSession()
      .then((loaded) => {
        if (!cancelled) {
          setSession(loaded);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSession(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const hasPermission = useCallback(
    (permission: PermissionKey) =>
      session?.permissionKeys.includes(permission) ?? false,
    [session],
  );

  const hasRole = useCallback(
    (role: RoleKey) => session?.roleKeys.includes(role) ?? false,
    [session],
  );

  return { session, isLoading, hasPermission, hasRole };
}
