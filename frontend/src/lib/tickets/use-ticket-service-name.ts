import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/query-keys";
import { listOfferedServices } from "@/services/service-catalog-api";
import type { TicketResponse } from "@/services/tickets-api";

/**
 * Faza 3.3: the detail header reads the service name from the shared catalog
 * cache instead of asking for the whole catalog on every ticket open.
 */
export function useTicketServiceName(ticket: TicketResponse | null): string {
  const query = useQuery({
    queryKey: queryKeys.offeredServices,
    queryFn: () => listOfferedServices(),
    enabled: ticket !== null,
  });
  if (ticket === null) {
    return "";
  }
  const match = query.data?.find((item) => item.id === ticket.serviceId);
  if (match !== undefined) {
    return match.name;
  }
  return query.data === undefined ? "" : ticket.serviceId;
}
