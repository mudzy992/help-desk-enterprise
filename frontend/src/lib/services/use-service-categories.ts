import { useCallback, useEffect, useState } from "react";
import { mapApiError, readApiRequestId, type ApiErrorKey } from "@/lib/map-api-error";
import {
  listServiceCategories,
  type ServiceCategoryResponse,
} from "@/services/service-categories-api";

export function useServiceCategories() {
  const [categories, setCategories] = useState<readonly ServiceCategoryResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<ApiErrorKey | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setErrorKey(null);
    setRequestId(null);
    try {
      setCategories(await listServiceCategories());
    } catch (error) {
      setCategories([]);
      setErrorKey(mapApiError(error));
      setRequestId(readApiRequestId(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { categories, isLoading, errorKey, requestId, reload };
}
