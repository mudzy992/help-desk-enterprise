import { useCallback, useMemo } from "react";
import { usePartialResource } from "@/lib/async/use-partial-resource";
import { formatUserRoleScopeSummary } from "@/lib/users/format-user-role-scope-summary";
import { mapApiError, type ApiErrorKey } from "@/lib/map-api-error";
import { listUserRoles } from "@/services/users-api";

const summaryCache = new Map<string, string>();

export function useUserRoleScopeSummaries(userIds: readonly string[]) {
  const identity = userIds.join("\u0000");
  const load = useCallback(async () => {
    const loaded = await Promise.all(
      userIds.map(async (userId) => {
        if (summaryCache.has(userId)) return [userId, summaryCache.get(userId) ?? ""] as const;
        const summary = formatUserRoleScopeSummary(await listUserRoles(userId));
        summaryCache.set(userId, summary);
        return [userId, summary] as const;
      }),
    );
    return new Map(loaded);
  }, [identity]); // eslint-disable-line react-hooks/exhaustive-deps

  const resource = usePartialResource<ReadonlyMap<string, string>, ApiErrorKey>({
    load,
    mapError: mapApiError,
    resetKey: identity,
  });
  return useMemo(
    () => ({ ...resource, data: resource.data ?? new Map<string, string>() }),
    [resource],
  );
}
