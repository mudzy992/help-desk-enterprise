import { useEffect, useState } from "react";
import {
  findUserRoleGroupCoverageGaps,
  type UserRoleGroupCoverageGap,
} from "@/lib/users/user-role-group-coverage";
import type { UserRoleResponse } from "@/services/users-api";

export function useUserRoleGroupCoverageGaps(
  userId: string,
  roles: readonly UserRoleResponse[],
  isRolesLoading: boolean,
): readonly UserRoleGroupCoverageGap[] {
  const [gaps, setGaps] = useState<readonly UserRoleGroupCoverageGap[]>([]);

  useEffect(() => {
    if (isRolesLoading) {
      setGaps([]);
      return;
    }
    let cancelled = false;
    void findUserRoleGroupCoverageGaps(userId, roles).then((loadedGaps) => {
      if (!cancelled) {
        setGaps(loadedGaps);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [userId, roles, isRolesLoading]);

  return gaps;
}
