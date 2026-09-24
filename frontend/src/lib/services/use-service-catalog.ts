import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/query-keys";
import { mapApiError, readApiRequestId, type ApiErrorKey } from "@/lib/map-api-error";
import {
  getServiceForm,
  listServices,
  type ServiceFormResponse,
  type ServiceResponse,
} from "@/services/service-catalog-api";

export type ServiceCatalogRow = {
  readonly service: ServiceResponse;
  readonly form: ServiceFormResponse | null;
};

export type ServiceCatalogState = {
  readonly rows: readonly ServiceCatalogRow[];
  readonly isLoading: boolean;
  readonly errorKey: ApiErrorKey | null;
  readonly requestId: string | null;
  readonly reload: () => Promise<void>;
};

/**
 * Faza 3.3 (plan §3.3, grupa (a) — katalozi): servisi i njihove forme se drže u
 * React Query kešu (`staleTime` 5 min). Ekran zadržava isti ugovor (`rows`,
 * `isLoading`, `errorKey`, `requestId`, `reload`), a `reload` sada samo obara keš.
 */
export function useServiceCatalog(): ServiceCatalogState {
  const query = useQuery({
    queryKey: queryKeys.services,
    queryFn: async (): Promise<readonly ServiceCatalogRow[]> => {
      const services = await listServices();
      return Promise.all(
        // A service with no form version at all answers 404, which is the state
        // this screen exists to fix rather than an error to report.
        services.map(async (service) => ({
          service,
          form: await getServiceForm(service.id).catch(() => null),
        })),
      );
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
