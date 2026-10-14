import type { ComposerCollaborationOptions } from "@/components/tickets/ticket-message-composer";
import type { TicketActionView } from "@/lib/tickets/ticket-action-matrix";
import type { useTicketDetailPageModel } from "@/lib/tickets/use-ticket-detail-page-model";
import type { TicketResponse } from "@/services/tickets-api";

export type TicketDetailPageModel = ReturnType<typeof useTicketDetailPageModel>;

export type TicketDetailPageReadyModel = Omit<
  TicketDetailPageModel,
  "ticket" | "actions" | "composerCollaboration"
> & {
  readonly ticket: TicketResponse;
  readonly actions: TicketActionView;
  readonly composerCollaboration: ComposerCollaborationOptions;
};
