import { useCallback, useEffect, useState } from "react";
import { reportClientError } from "@/lib/app/client-logger";
import { mapTicketError, type TicketErrorKey } from "@/lib/tickets/map-ticket-error";
import { listMyGroups, type MyGroupResponse } from "@/services/groups-api";

export interface UseMyGroupsResult {
  readonly groups: readonly MyGroupResponse[];
  readonly isLoading: boolean;
  readonly errorKey: TicketErrorKey | null;
  readonly retry: () => void;
}

/** The caller's group memberships used to build group-specific inbox tabs. */
export function useMyGroups(): UseMyGroupsResult {
  const [groups, setGroups] = useState<readonly MyGroupResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<TicketErrorKey | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setErrorKey(null);
    void listMyGroups()
      .then((rows) => {
        if (!cancelled) setGroups(rows);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setGroups([]);
          setErrorKey(mapTicketError(error));
          reportClientError("ticket_group_memberships_failed", error);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [retryToken]);

  const retry = useCallback(() => setRetryToken((current) => current + 1), []);
  return { groups, isLoading, errorKey, retry };
}
