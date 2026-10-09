import { useEffect, useState } from "react";
import { listGroups } from "@/services/groups-api";

export type SlaEscalationGroupNames = ReadonlyMap<string, string> | null;

export function useSlaEscalationGroupNames(): SlaEscalationGroupNames {
  const [groupNames, setGroupNames] = useState<SlaEscalationGroupNames>(null);

  useEffect(() => {
    let cancelled = false;
    void listGroups()
      .then((groups) => {
        if (cancelled) return;
        setGroupNames(new Map(groups.map((group) => [group.id, group.name])));
      })
      .catch(() => {
        if (!cancelled) {
          setGroupNames(new Map());
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return groupNames;
}
