import { useEffect, useMemo, useState } from "react";
import { TicketErrorState, TicketLoadingState } from "@/components/tickets/ticket-feedback-states";
import { TicketInboxList } from "@/components/tickets/ticket-inbox-list";
import { TicketInboxTabs } from "@/components/tickets/ticket-inbox-tabs";
import { TicketInboxUnroutedBanner } from "@/components/tickets/ticket-inbox-unrouted-banner";
import {
  inboxGroupTabsFromInboxTickets,
  ticketsForInboxTab,
  unroutedInboxTabKey,
} from "@/lib/tickets/inbox-view-tabs";
import type { TicketErrorKey } from "@/lib/tickets/map-ticket-error";
import type { TicketResponse } from "@/services/tickets-api";

interface TicketInboxPanelProperties {
  readonly inboxTickets: readonly TicketResponse[];
  readonly unroutedTickets: readonly TicketResponse[];
  readonly serviceNames: ReadonlyMap<string, string>;
  readonly originNames: ReadonlyMap<string, string>;
  readonly requesterNames: ReadonlyMap<string, string>;
  readonly claimingId: string | null;
  readonly isLoading: boolean;
  readonly errorKey: TicketErrorKey | null;
  readonly onClaim: (ticketId: string) => void;
  readonly onRetry: () => void;
}

export function TicketInboxPanel({
  inboxTickets,
  unroutedTickets,
  serviceNames,
  originNames,
  requesterNames,
  claimingId,
  isLoading,
  errorKey,
  onClaim,
  onRetry,
}: TicketInboxPanelProperties) {
  const [activeTab, setActiveTab] = useState(unroutedInboxTabKey);
  const groups = useMemo(
    () => inboxGroupTabsFromInboxTickets(inboxTickets),
    [inboxTickets],
  );
  useEffect(() => {
    if (activeTab === unroutedInboxTabKey) {
      return;
    }
    if (!groups.some((group) => group.groupId === activeTab)) {
      setActiveTab(unroutedInboxTabKey);
    }
  }, [activeTab, groups]);
  const tabTickets = ticketsForInboxTab(activeTab, inboxTickets, unroutedTickets);
  return (
    <div className="mt-4">
      <TicketInboxTabs
        activeTab={activeTab}
        unroutedCount={unroutedTickets.length}
        groups={groups}
        onChange={setActiveTab}
      />
      {activeTab === unroutedInboxTabKey ? <TicketInboxUnroutedBanner /> : null}
      {isLoading ? (
        <TicketLoadingState />
      ) : errorKey ? (
        <TicketErrorState errorKey={errorKey} onRetry={onRetry} />
      ) : (
        <TicketInboxList
          activeTab={activeTab}
          tickets={tabTickets}
          serviceNames={serviceNames}
          originNames={originNames}
          requesterNames={requesterNames}
          claimingId={claimingId}
          onClaim={onClaim}
        />
      )}
    </div>
  );
}
