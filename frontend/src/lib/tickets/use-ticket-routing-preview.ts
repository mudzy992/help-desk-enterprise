import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/query-keys";
import {
  fetchTicketRoutingPreview,
  type TicketRoutingPreview,
} from "@/services/tickets-routing-preview-api";

/**
 * Val 5, M7 B2: the review step asks the server which group (and SLA profile)
 * the ticket would land in, using the same decision `POST /tickets` makes.
 * Nothing is created; the request is skipped until a service is selected.
 */
export function useTicketRoutingPreview(
  serviceId: string,
  originUnitId: string,
) {
  return useQuery<TicketRoutingPreview>({
    queryKey: queryKeys.ticketRoutingPreview(serviceId, originUnitId),
    queryFn: () =>
      fetchTicketRoutingPreview({
        serviceId,
        ...(originUnitId.trim().length > 0 ? { originUnitId } : {}),
      }),
    enabled: serviceId.trim().length > 0,
    retry: false,
  });
}
