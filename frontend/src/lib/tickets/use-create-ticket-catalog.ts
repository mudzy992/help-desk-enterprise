import { useQuery } from "@tanstack/react-query";
import { loadCreateTicketCatalog } from "@/lib/tickets/load-create-ticket-catalog";
import type { OriginUnitOption } from "@/lib/tickets/ticket-display";
import { queryKeys } from "@/lib/query/query-keys";
import type { ServiceResponse } from "@/services/service-catalog-api";

/**
 * Faza 3.3 (plan §3.3, grupa (a) — katalozi): the create-ticket catalog (offered
 * services + origin units) is cached for the catalog window, so opening the form
 * twice in a session costs one request. The loader itself is unchanged and stays
 * covered by its own spec.
 */
export function useCreateTicketCatalog(): {
  readonly services: readonly ServiceResponse[];
  readonly originUnits: readonly OriginUnitOption[];
  readonly isLoading: boolean;
  readonly errorKey: "tickets.errorCatalog" | null;
} {
  const query = useQuery({
    queryKey: queryKeys.createTicketCatalog,
    queryFn: () => loadCreateTicketCatalog(),
  });

  return {
    services: query.data?.services ?? [],
    originUnits: query.data?.originUnits ?? [],
    isLoading: query.isLoading,
    errorKey: query.data?.errorKey ?? null,
  };
}
