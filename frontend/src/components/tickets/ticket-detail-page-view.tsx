import { TicketDetailBlockingState } from "@/components/tickets/ticket-detail-blocking-state";
import { TicketDetailActionPanels } from "@/components/tickets/ticket-detail-action-panels";
import { TicketDetailHeaderSection } from "@/components/tickets/ticket-detail-header-section";
import { TicketDetailMainSection } from "@/components/tickets/ticket-detail-main-section";
import type { TicketDetailPageReadyModel } from "@/components/tickets/ticket-detail-page-types";
import { useTicketDetailPageModel } from "@/lib/tickets/use-ticket-detail-page-model";

export function TicketDetailPageView() {
  const model = useTicketDetailPageModel();
  const { detail, ticket, actions, composerCollaboration } = model;
  if (detail.isLoading || ticket === null || actions === null || composerCollaboration === null) {
    return (
      <TicketDetailBlockingState
        isLoading={detail.isLoading}
        errorKey={detail.errorKey}
        ticketId={model.ticketId}
        onReload={() => void detail.reload()}
      />
    );
  }
  const readyModel: TicketDetailPageReadyModel = {
    ...model,
    ticket,
    actions,
    composerCollaboration,
  };
  return (
    <section>
      <TicketDetailHeaderSection model={readyModel} />
      <TicketDetailMainSection model={readyModel} />
      <TicketDetailActionPanels model={readyModel} />
    </section>
  );
}
