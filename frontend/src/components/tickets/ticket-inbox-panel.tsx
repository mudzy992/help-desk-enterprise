import { useEffect, useMemo, useState } from "react";
import { ActionFeedbackBanner } from "@/components/feedback/action-feedback-banner";
import { TicketErrorState, TicketLoadingState } from "@/components/tickets/ticket-feedback-states";
import { TicketInboxList } from "@/components/tickets/ticket-inbox-list";
import { TicketInboxNoGroupNotice } from "@/components/tickets/ticket-inbox-no-group-notice";
import { TicketInboxTabs } from "@/components/tickets/ticket-inbox-tabs";
import { TicketInboxUnroutedBanner } from "@/components/tickets/ticket-inbox-unrouted-banner";
import type { ActionFeedback } from "@/lib/feedback/use-action-feedback";
import {
  inboxGroupTabsFromMembership,
  ticketsForInboxTab,
  unroutedInboxTabKey,
} from "@/lib/tickets/inbox-view-tabs";
import { useMyGroups } from "@/lib/tickets/use-my-groups";
import type { TicketErrorKey } from "@/lib/tickets/map-ticket-error";
import type { TicketResponse } from "@/services/tickets-api";

interface TicketInboxPanelProperties {
  readonly inboxTickets: readonly TicketResponse[];
  readonly unroutedTickets: readonly TicketResponse[];
  readonly serviceNames: ReadonlyMap<string, string>;
  readonly originNames: ReadonlyMap<string, string>;
  readonly requesterNames: ReadonlyMap<string, string>;
  readonly claimingId: string | null;
  readonly hasGroupMembership: boolean | null;
  readonly canManageGroups: boolean;
  readonly isLoading: boolean;
  readonly errorKey: TicketErrorKey | null;
  readonly feedback: ActionFeedback | null;
  readonly onDismissFeedback: () => void;
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
  hasGroupMembership,
  canManageGroups,
  isLoading,
  errorKey,
  feedback,
  onDismissFeedback,
  onClaim,
  onRetry,
}: TicketInboxPanelProperties) {
  const [activeTab, setActiveTab] = useState(unroutedInboxTabKey);
  const { groups: myGroups } = useMyGroups();
  const groups = useMemo(
    () => inboxGroupTabsFromMembership(myGroups, inboxTickets),
    [myGroups, inboxTickets],
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
      <ActionFeedbackBanner feedback={feedback} onDismiss={onDismissFeedback} />
      <TicketInboxTabs
        activeTab={activeTab}
        unroutedCount={unroutedTickets.length}
        groups={groups}
        onChange={setActiveTab}
      />
      {hasGroupMembership === false && !isLoading && errorKey === null ? (
        <TicketInboxNoGroupNotice canManageGroups={canManageGroups} />
      ) : null}
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
