import { apiRequest } from "@/services/api";
import type { TicketResponse } from "@/services/tickets-api";

export type TicketCsatBucket = {
  readonly key: string;
  /** Val 1 (M9/B3): naziv organizacione jedinice, servisa ili grupe. */
  readonly label: string;
  readonly count: number;
  readonly average: number;
};

/**
 * Val 1 (M9/B3): agregacija po OU/servisu/grupi je postojala na serveru, ali je
 * nijedan ekran nije zvao. `scaleMax` i `satisfiedMinRating` dolaze sa servera,
 * pa prikaz ne pretpostavlja skalu 5.
 */
export type TicketCsatSummary = {
  readonly count: number;
  readonly average: number | null;
  readonly scaleMax: number;
  readonly satisfiedMinRating: number;
  readonly byOriginUnit: readonly TicketCsatBucket[];
  readonly byService: readonly TicketCsatBucket[];
  readonly byGroup: readonly TicketCsatBucket[];
};

export function fetchTicketCsatSummary(): Promise<TicketCsatSummary> {
  return apiRequest("/tickets/csat/summary");
}

export function submitTicketCsat(
  ticketId: string,
  input: { rating: number; comment?: string },
): Promise<TicketResponse> {
  return apiRequest(`/tickets/${ticketId}/csat`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
