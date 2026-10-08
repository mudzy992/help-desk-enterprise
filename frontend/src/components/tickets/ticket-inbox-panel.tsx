import { useEffect, useMemo } from "react";
import { TicketErrorState, TicketLoadingState } from "@/components/tickets/ticket-feedback-states";
import { TicketInboxList } from "@/components/tickets/ticket-inbox-list";
import { TicketInboxNoGroupNotice } from "@/components/tickets/ticket-inbox-no-group-notice";
import { TicketInboxTabs } from "@/components/tickets/ticket-inbox-tabs";
import { TicketInboxUnroutedBanner } from "@/components/tickets/ticket-inbox-unrouted-banner";
import {
  inboxGroupTabsFromMembership,
  ticketsForInboxTab,
  unroutedInboxTabKey,
} from "@/lib/tickets/inbox-view-tabs";
import { useMyGroups } from "@/lib/tickets/use-my-groups";
import type { TicketErrorKey } from "@/lib/tickets/map-ticket-error";
import type { TicketResponse } from "@/services/tickets-api";

interface TicketInboxPanelProperties {
  readonly activeTab: string;
  readonly onChangeTab: (tab: string) => void;
  readonly inboxTickets: readonly TicketResponse[];
  readonly unroutedTickets: readonly TicketResponse[];
  readonly unroutedCount: number;
  readonly unroutedPage: number;
  readonly unroutedTotalPages: number;
  readonly onChangeUnroutedPage: (page: number) => void;
  readonly serviceNames: ReadonlyMap<string, string>;
  readonly originNames: ReadonlyMap<string, string>;
  readonly requesterNames: ReadonlyMap<string, string>;
  readonly claimingId: string | null;
  readonly hasGroupMembership: boolean | null;
  readonly canManageGroups: boolean;
  readonly isLoading: boolean;
  readonly errorKey: TicketErrorKey | null;
  readonly onClaim: (ticketId: string) => void;
  readonly onRetry: () => void;
}

export function TicketInboxPanel({
  activeTab,
  onChangeTab,
  inboxTickets,
  unroutedTickets,
  unroutedCount,
  unroutedPage,
  unroutedTotalPages,
  onChangeUnroutedPage,
  serviceNames,
  originNames,
  requesterNames,
  claimingId,
  hasGroupMembership,
  canManageGroups,
  isLoading,
  errorKey,
  onClaim,
  onRetry,
}: TicketInboxPanelProperties) {
  const { groups: myGroups } = useMyGroups();
  const groups = useMemo(
    () => inboxGroupTabsFromMembership(myGroups, inboxTickets),
    [myGroups, inboxTickets],
  );
  // Fall back to the unrouted tab when membership changes make the current
  // tab disappear (e.g. user was removed from the group). The effect runs
  // once membership is known so we don't flash the banner on first load.
  useEffect(() => {
    if (activeTab === unroutedInboxTabKey) {
      return;
    }
    if (!groups.some((group) => group.groupId === activeTab)) {
      onChangeTab(unroutedInboxTabKey);
    }
  }, [activeTab, groups, onChangeTab]);
  const tabTickets = ticketsForInboxTab(activeTab, inboxTickets, unroutedTickets);
  return (
    <div className="mt-4">
      <TicketInboxTabs
        activeTab={activeTab}
        unroutedCount={unroutedCount}
        groups={groups}
        onChange={onChangeTab}
      />
      {activeTab !== unroutedInboxTabKey &&
      hasGroupMembership === false &&
      !isLoading &&
      errorKey === null ? (
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
          page={unroutedPage}
          totalPages={unroutedTotalPages}
          onChangePage={onChangeUnroutedPage}
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
