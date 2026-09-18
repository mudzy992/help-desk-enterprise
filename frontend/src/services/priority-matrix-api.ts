import { apiRequest } from "@/services/api";
import type { TicketImpact, TicketPriority, TicketUrgency } from "@/services/tickets-api";

export type PriorityMatrixCell = {
  readonly id: string;
  readonly impact: TicketImpact;
  readonly urgency: TicketUrgency;
  readonly priority: TicketPriority;
};

export type PriorityMatrixResponse = {
  readonly cells: readonly PriorityMatrixCell[];
};

export type PatchPriorityMatrixInput = {
  readonly cells: readonly {
    readonly impact: TicketImpact;
    readonly urgency: TicketUrgency;
    readonly priority: TicketPriority;
  }[];
  readonly reason: string;
};

export function listPriorityMatrix(): Promise<PriorityMatrixResponse> {
  return apiRequest("/priority-matrix");
}

export function patchPriorityMatrix(
  input: PatchPriorityMatrixInput,
): Promise<PriorityMatrixResponse> {
  return apiRequest("/priority-matrix", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
