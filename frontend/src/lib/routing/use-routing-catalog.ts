import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/query-keys";
import { mapRoutingError } from "@/lib/routing/map-routing-error";
import { readApiRequestId } from "@/lib/map-api-error";
import { flattenOriginUnitOptions } from "@/lib/tickets/ticket-display";
import { listOrganizationalUnitTree } from "@/services/organizational-units-api";
import { listRoutingHandlerGroups } from "@/services/routing-api";
import { listServices } from "@/services/service-catalog-api";

/**
 * Faza 3.3 (plan §3.3, grupa (a) — katalozi): OU stablo, servisi i grupe rukovaoca
 * se drže u React Query kešu (`staleTime` 5 min), pa se kroz sesiju povlače
 * najviše jednom — prije ove faze isti katalog se dohvatao 2–4×.
 *
 * Ugovor prema ekranima je nepromijenjen (`originUnits`, `services`, `groups`,
 * `isLoading`, `errorKey`, `requestId`), a `reload` sada samo obara keš.
 */
export function useRoutingCatalog() {
  const query = useQuery({
    queryKey: queryKeys.routingCatalog,
    queryFn: async () => {
      const [tree, catalog, handlerGroups] = await Promise.all([
        listOrganizationalUnitTree(),
        listServices(),
        listRoutingHandlerGroups(),
      ]);
      return {
        originUnits: flattenOriginUnitOptions(tree),
        services: catalog,
        groups: handlerGroups,
      };
    },
  });

  const reload = useCallback(async () => {
    await query.refetch();
  }, [query]);

  return {
    originUnits: query.data?.originUnits ?? [],
    services: query.data?.services ?? [],
    groups: query.data?.groups ?? [],
    isLoading: query.isLoading,
    errorKey: query.error === null ? null : mapRoutingError(query.error),
    requestId: query.error === null ? null : readApiRequestId(query.error),
    reload,
  };
}
