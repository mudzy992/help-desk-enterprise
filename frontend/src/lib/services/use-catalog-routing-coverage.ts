import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildCatalogRoutingIndex,
  type CatalogRoutingIndex,
} from "@/lib/services/catalog-routing-index";
import { listRoutingCoverage, type RoutingCoverageItem } from "@/services/routing-api";

export type CatalogRoutingCoverageState = CatalogRoutingIndex & {
  readonly isLoading: boolean;
  readonly isAvailable: boolean;
  readonly reload: () => Promise<void>;
};

const emptyIndex: CatalogRoutingIndex = {
  notesByServiceId: new Map(),
  originUnits: [],
  serviceIdsWithExactRuleByOriginUnit: new Map(),
};

export function useCatalogRoutingCoverage(): CatalogRoutingCoverageState {
  const [index, setIndex] = useState<CatalogRoutingIndex>(emptyIndex);
  const [isLoading, setIsLoading] = useState(true);
  const [isAvailable, setIsAvailable] = useState(false);
  const requestSequence = useRef(0);

  const reload = useCallback(async () => {
    const sequence = ++requestSequence.current;
    setIsLoading(true);
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

      if (sequence === requestSequence.current) {
        setIndex(buildCatalogRoutingIndex(items));
        setIsAvailable(true);
      }
    } catch {
      if (sequence === requestSequence.current) {
        setIndex(emptyIndex);
        setIsAvailable(false);
      }
    } finally {
      if (sequence === requestSequence.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { ...index, isLoading, isAvailable, reload };
}
