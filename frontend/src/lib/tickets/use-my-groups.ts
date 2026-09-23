import { useEffect, useState } from "react";
import { listMyGroups, type MyGroupResponse } from "@/services/groups-api";

export interface UseMyGroupsResult {
  readonly groups: readonly MyGroupResponse[];
  readonly isLoading: boolean;
}

/**
 * The caller's group memberships (`GET /groups/mine`), used to build the
 * inbox tabs from membership instead of from whatever tickets happen to be
 * loaded (INB-01). Failing open to an empty list keeps the inbox usable —
 * the unrouted tab and `hasGroupMembership` messaging still apply.
 */
export function useMyGroups(): UseMyGroupsResult {
  const [groups, setGroups] = useState<readonly MyGroupResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    listMyGroups()
      .then((rows) => {
        if (!cancelled) {
          setGroups(rows);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setGroups([]);
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
  }, []);

  return { groups, isLoading };
}
