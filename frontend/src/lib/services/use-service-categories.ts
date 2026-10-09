import { useCallback, useEffect, useRef, useState } from "react";
import { mapApiError, readApiRequestId, type ApiErrorKey } from "@/lib/map-api-error";
import {
  listServiceCategories,
  type ServiceCategoryResponse,
} from "@/services/service-categories-api";

export function useServiceCategories() {
  const [categories, setCategories] = useState<readonly ServiceCategoryResponse[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<ApiErrorKey | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const requestSequence = useRef(0);

  const reload = useCallback(async () => {
    const sequence = ++requestSequence.current;
    setIsLoading(true);
    setErrorKey(null);
    setRequestId(null);
    try {
      const loaded = await listServiceCategories();
      if (sequence === requestSequence.current) {
        setCategories(loaded);
      }
    } catch (error) {
      // Keep the last successful category list during a transient refresh error.
      // Clearing it here made the catalog flicker to an empty state until a full
      // page reload, even though its cached service rows were still available.
      if (sequence === requestSequence.current) {
        setErrorKey(mapApiError(error));
        setRequestId(readApiRequestId(error));
      }
    } finally {
      if (sequence === requestSequence.current) {
        setHasLoaded(true);
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { categories, hasLoaded, isLoading, errorKey, requestId, reload };
}
