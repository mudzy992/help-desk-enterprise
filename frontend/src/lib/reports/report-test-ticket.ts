import type { TicketResponse, TicketStatus } from "@/services/tickets-api";

export function reportTestTicket(
  id: string,
  status: TicketStatus,
  overrides: Partial<TicketResponse> = {},
): TicketResponse {
  return {
    id,
    ticketNumber: `T-${id}`,
    title: `Ticket ${id}`,
    description: "",
    status,
    priority: "MEDIUM",
    impact: "MEDIUM",
    urgency: "MEDIUM",
    classification: "INTERNAL",
    isConfidential: false,
    formData: null,
    originUnitId: "ou-1",
    serviceId: "svc-1",
    formVersionRef: "form-1",
    requesterId: "user-1",
    assignedGroupId: "group-1",
    assignedUserId: null,
    createdAt: "2026-09-10T08:00:00.000Z",
    updatedAt: "2026-09-10T08:00:00.000Z",
    ...overrides,
  };
}
