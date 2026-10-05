import { apiRequest } from "@/services/api";

/**
 * Mirrors `backend/src/modules/tickets/routing-preview/routing-preview.types.ts`.
 * `outcome` uses `routingOutcomes` from `backend/src/modules/routing/routing.constants.ts`.
 */
export type TicketRoutingOutcome = "EXACT" | "PARENT_FALLBACK" | "UNROUTED";

export type TicketRoutingPreview = {
  readonly outcome: TicketRoutingOutcome;
  readonly groupName: string | null;
  readonly fallbackDepth: number;
  readonly autoAssign: string;
  /** 0 or 1 (decision F1-5): whether the ticket would need approval before routing. */
  readonly approvalSteps: 0 | 1;
  readonly slaProfileName: string | null;
};

/**
 * Same routing decision `POST /tickets` would make, without creating anything.
 * Val 5, M7 B2: the review step used to say only "the outcome is decided on
 * submit"; it now shows the target group and profile before sending.
 */
export function fetchTicketRoutingPreview(input: {
  readonly serviceId: string;
  readonly originUnitId?: string;
}): Promise<TicketRoutingPreview> {
  const originUnitId = input.originUnitId?.trim() ?? "";
  return apiRequest("/tickets/routing-preview", {
    method: "POST",
    body: JSON.stringify({
      serviceId: input.serviceId,
      ...(originUnitId.length > 0 ? { originUnitId } : {}),
    }),
  });
}
