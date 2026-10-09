import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildCatalogRoutingIndex,
  type CatalogRoutingIndex,
} from "@/lib/services/catalog-routing-index";
import { loadCatalogRoutingCoverage } from "@/lib/services/load-catalog-routing-coverage";

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
      const items = await loadCatalogRoutingCoverage();

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
