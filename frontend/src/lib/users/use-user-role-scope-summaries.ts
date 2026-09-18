import { useEffect, useState } from "react";
import { formatUserRoleScopeSummary } from "@/lib/users/format-user-role-scope-summary";
import { listUserRoles } from "@/services/users-api";

const summaryCache = new Map<string, string>();

export function useUserRoleScopeSummaries(
  userIds: readonly string[],
): ReadonlyMap<string, string> {
  const [summaries, setSummaries] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );

  useEffect(() => {
    const missingUserIds = userIds.filter((userId) => !summaryCache.has(userId));
    if (missingUserIds.length === 0) {
      setSummaries(
        new Map(userIds.map((userId) => [userId, summaryCache.get(userId) ?? ""])),
      );
      return;
    }
    let cancelled = false;
    void Promise.all(
      missingUserIds.map(async (userId) => {
        const roles = await listUserRoles(userId).catch(() => []);
        const summary = formatUserRoleScopeSummary(roles);
        summaryCache.set(userId, summary);
        return { userId, summary };
      }),
    ).then((loaded) => {
      if (cancelled) {
        return;
      }
      setSummaries(
        new Map(
          userIds.map((userId) => [
            userId,
            summaryCache.get(userId) ??
              loaded.find((entry) => entry.userId === userId)?.summary ??
              "",
          ]),
        ),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [userIds]);

  return summaries;
}
