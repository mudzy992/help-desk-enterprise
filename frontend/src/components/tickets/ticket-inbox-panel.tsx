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
  readonly inboxGroupCounts: ReadonlyMap<string, number>;
  readonly inboxPage: number;
  readonly inboxTotalPages: number;
  readonly inboxTotalIsCapped: boolean;
  readonly onChangeInboxPage: (page: number) => void;
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
  readonly catalogErrorKey?: TicketErrorKey | null;
  readonly unroutedErrorKey?: TicketErrorKey | null;
  readonly membershipErrorKey?: TicketErrorKey | null;
  readonly onClaim: (ticketId: string) => void;
  readonly onRetry: () => void;
}

export function TicketInboxPanel({
  activeTab,
  onChangeTab,
  inboxTickets,
  inboxGroupCounts,
  inboxPage,
  inboxTotalPages,
  inboxTotalIsCapped,
  onChangeInboxPage,
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
  catalogErrorKey = null,
  unroutedErrorKey = null,
  membershipErrorKey = null,
  onClaim,
  onRetry,
}: TicketInboxPanelProperties) {
  const {
    groups: myGroups,
    isLoading: groupsLoading,
    errorKey: groupsErrorKey,
    retry: retryGroups,
  } = useMyGroups();
  const groups = useMemo(
    () => inboxGroupTabsFromMembership(myGroups, inboxTickets, inboxGroupCounts),
    [myGroups, inboxGroupCounts, inboxTickets],
  );
  // Fall back to the unrouted tab when membership changes make the current
  // tab disappear (e.g. user was removed from the group). The effect runs
  // once membership is known so we don't flash the banner on first load.
  useEffect(() => {
    if (
      activeTab === unroutedInboxTabKey ||
      groupsLoading ||
      groupsErrorKey !== null ||
      hasGroupMembership === null
    ) {
      return;
    }
    if (!groups.some((group) => group.groupId === activeTab)) {
      onChangeTab(unroutedInboxTabKey);
    }
  }, [activeTab, groups, groupsErrorKey, groupsLoading, hasGroupMembership, onChangeTab]);
  const tabTickets = ticketsForInboxTab(activeTab, inboxTickets, unroutedTickets);
  const isUnroutedTab = activeTab === unroutedInboxTabKey;
  return (
    <div className="mt-4">
      <TicketInboxTabs
        activeTab={activeTab}
        unroutedCount={unroutedCount}
        groups={groups}
        onChange={onChangeTab}
      />
      {catalogErrorKey !== null ? (
        <div className="mt-3">
          <TicketErrorState errorKey={catalogErrorKey} onRetry={onRetry} />
        </div>
      ) : null}
      {activeTab !== unroutedInboxTabKey &&
      (groupsErrorKey !== null || membershipErrorKey !== null) ? (
        <div className="mt-3">
          <TicketErrorState
            errorKey={groupsErrorKey ?? membershipErrorKey ?? "tickets.errorGeneric"}
            onRetry={groupsErrorKey !== null ? retryGroups : onRetry}
          />
        </div>
      ) : null}
      {activeTab !== unroutedInboxTabKey &&
      hasGroupMembership === false &&
      groupsErrorKey === null &&
      !groupsLoading &&
      !isLoading &&
      errorKey === null ? (
        <TicketInboxNoGroupNotice canManageGroups={canManageGroups} />
      ) : null}
      {activeTab === unroutedInboxTabKey ? <TicketInboxUnroutedBanner /> : null}
      {isLoading ? (
        <TicketLoadingState />
      ) : errorKey ? (
        <TicketErrorState errorKey={errorKey} onRetry={onRetry} />
      ) : activeTab === unroutedInboxTabKey && unroutedErrorKey !== null ? (
        <TicketErrorState errorKey={unroutedErrorKey} onRetry={onRetry} />
      ) : (
        <TicketInboxList
          activeTab={activeTab}
          tickets={tabTickets}
          page={isUnroutedTab ? unroutedPage : inboxPage}
          totalPages={isUnroutedTab ? unroutedTotalPages : inboxTotalPages}
          totalIsCapped={isUnroutedTab ? false : inboxTotalIsCapped}
          onChangePage={isUnroutedTab ? onChangeUnroutedPage : onChangeInboxPage}
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
