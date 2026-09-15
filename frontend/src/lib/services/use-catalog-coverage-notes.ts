import { useCallback, useEffect, useState } from "react";
import { catalogCoverageNote, type CatalogCoverageNote } from "@/lib/services/catalog-coverage-note";
import { listRoutingCoverage } from "@/services/routing-api";

export function useCatalogCoverageNotes() {
  const [notes, setNotes] = useState<ReadonlyMap<string, CatalogCoverageNote>>(
    new Map(),
  );

  const reload = useCallback(async () => {
    try {
      const items = await listRoutingCoverage();
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
