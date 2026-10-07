import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/query-keys";
import { mapApiError, readApiRequestId, type ApiErrorKey } from "@/lib/map-api-error";
import {
  listServices,
  type ServiceResponse,
} from "@/services/service-catalog-api";

export type ServiceCatalogRow = {
  readonly service: ServiceResponse;
};

export type ServiceCatalogState = {
  readonly rows: readonly ServiceCatalogRow[];
  readonly isLoading: boolean;
  readonly errorKey: ApiErrorKey | null;
  readonly requestId: string | null;
  readonly reload: () => Promise<void>;
};

/**
 * Faza 3.3 (plan §3.3, grupa (a) — katalozi): servisi i sažetak aktivne forme
 * stižu u jednom batch pozivu (`listServices` već uključuje `activeForm`
 * sažetak koji je backend skupio kroz `loadActiveFormSummaries`). Nema N+1
 * round-tripova po servisu; ekran zadržava isti `rows` ugovor, a oblik se
 * proširuje samo kad bude trebalo.
 */
export function useServiceCatalog(): ServiceCatalogState {
  const query = useQuery({
    queryKey: queryKeys.services,
    queryFn: async (): Promise<readonly ServiceCatalogRow[]> => {
      const services = await listServices();
      return services.map((service) => ({ service }));
    },
  });

  const reload = useCallback(async () => {
    await query.refetch();
  }, [query]);

  return {
    rows: query.data ?? [],
    isLoading: query.isLoading,
    errorKey: query.error === null ? null : mapApiError(query.error),
    requestId: query.error === null ? null : readApiRequestId(query.error),
    reload,
  };
}
