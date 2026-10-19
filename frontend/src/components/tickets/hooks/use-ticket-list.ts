import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/ui/toast";
import { queryKeys } from "@/lib/query/query-keys";
import { useSession } from "@/lib/session/use-session";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";
import { isTicketStaff } from "@/lib/session/route-access";
import { mapClaimError } from "@/lib/tickets/map-ticket-error";
import { ticketListPageSize, unroutedTicketPageSize } from "@/lib/tickets/ticket-constants";
import { useTicketListData } from "@/lib/tickets/use-ticket-list-data";
import { useTicketListState } from "@/lib/tickets/use-ticket-list-state";
import { claimTicket } from "@/services/tickets-api";

/** Thin facade joining URL/selection state, remote list data and ticket actions. */
export function useTicketList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentUserId } = useSession();
  const capabilities = useSessionCapabilities();
  const isStaff = isTicketStaff(capabilities);
  const state = useTicketListState({
    currentUserId,
    isStaff,
    hasSession: capabilities.session !== null,
  });
  const data = useTicketListData({
    enabled: !capabilities.isLoading && state.isDeepLinkReady,
    view: state.view,
    filters: state.filters,
    page: state.page,
    setPage: state.setPage,
    unroutedPage: state.unroutedPage,
    setUnroutedPage: state.setUnroutedPage,
    currentUserId,
    setSearchParams: state.setSearchParams,
  });
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const { load } = data;

  const onClaim = useCallback(
    async (ticketId: string) => {
      setClaimingId(ticketId);
      try {
        await claimTicket(ticketId);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.ticketLists }),
          queryClient.invalidateQueries({ queryKey: queryKeys.ticketCountsPrefix }),
        ]);
        toast({
          tone: "success",
          title: t("tickets.claimSuccess"),
          action: {
            label: t("tickets.claimSuccessOpen"),
            onClick: () => navigate(`/tickets/${ticketId}`),
          },
        });
        await load(true);
      } catch (error) {
        toast({ tone: "danger", title: t(mapClaimError(error)), error });
      } finally {
        setClaimingId(null);
      }
    },
    [load, navigate, queryClient, t, toast],
  );

  const serviceNames = useMemo(
    () => new Map(data.services.map((service) => [service.id, service.name])),
    [data.services],
  );
  const totalPages = Math.max(
    1,
    Math.ceil(data.pageInfo.total / (data.pageInfo.pageSize || ticketListPageSize)),
  );
  const unroutedTotalPages = Math.max(1, Math.ceil(data.unroutedTotal / unroutedTicketPageSize));

  return {
    view: state.view,
    isStaff,
    inboxHidden: data.inboxHidden,
    hasGroupMembership: data.hasGroupMembership,
    filters: state.filters,
    setFilters: state.setFilters,
    setSearch: state.setSearch,
    setInboxTab: state.setInboxTab,
    page: state.page,
    setPage: state.setPage,
    totalPages,
    pageItems: data.pageItems,
    total: data.pageInfo.total,
    totalIsCapped: data.pageInfo.totalIsCapped,
    counts: data.counts,
    inboxGroupCounts: data.inboxGroupCounts,
    unroutedTickets: data.unroutedTickets,
    unroutedCount: data.unroutedTotal,
    unroutedPage: state.unroutedPage,
    unroutedTotalPages,
    setUnroutedPage: state.setUnroutedPage,
    serviceNames,
    services: data.services,
    isLoading: data.isLoading,
    errorKey: data.errorKey,
    catalogErrorKey: data.catalogErrorKey,
    unroutedErrorKey: data.unroutedErrorKey,
    membershipErrorKey: data.membershipErrorKey,
    setErrorKey: data.setErrorKey,
    claimingId,
    selectedIds: state.selectedIds,
    setSelectedIds: state.setSelectedIds,
    toggleSelected: state.toggleSelected,
    load,
    onClaim,
  };
}
