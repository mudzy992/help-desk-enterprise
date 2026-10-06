import { useCallback, useEffect, useState } from "react";
import { catalogCoverageNote, type CatalogCoverageNote } from "@/lib/services/catalog-coverage-note";
import {
  listRoutingCoverage,
  type RoutingCoverageItem,
} from "@/services/routing-api";

export function useCatalogCoverageNotes() {
  const [notes, setNotes] = useState<ReadonlyMap<string, CatalogCoverageNote>>(
    new Map(),
  );

  const reload = useCallback(async () => {
    try {
      const items: RoutingCoverageItem[] = [];
      let cursor: string | undefined;
      do {
        const page = await listRoutingCoverage({
          includeInactive: true,
          take: 100,
          cursor,
        });
        items.push(...page.items);
        cursor = page.nextCursor ?? undefined;
      } while (cursor !== undefined);

      const next = new Map<string, CatalogCoverageNote>();
      for (const item of items) {
        if (next.has(item.serviceId)) {
          continue;
        }
        const note = catalogCoverageNote(items, item.serviceId);
        if (note !== null) {
          next.set(item.serviceId, note);
        }
      }
      setNotes(next);
    } catch {
      setNotes(new Map());
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return notes;
}
