import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/ui/toast";
import { queryKeys } from "@/lib/query/query-keys";
import { isTicketStaff } from "@/lib/session/route-access";
import { useSession } from "@/lib/session/use-session";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";
import { mapClaimError } from "@/lib/tickets/map-ticket-error";
import { unroutedTicketPageSize } from "@/lib/tickets/ticket-constants";
import { useTicketListData } from "@/lib/tickets/use-ticket-list-data";
import { useTicketListState } from "@/lib/tickets/use-ticket-list-state";
import { claimTicket } from "@/services/tickets-api";

export function useTicketList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { currentUserId } = useSession();
  const queryClient = useQueryClient();
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
  const totalPages = Math.max(1, Math.ceil(data.pageInfo.total / data.pageInfo.pageSize));
  const unroutedTotalPages = Math.max(1, Math.ceil(data.unroutedTotal / unroutedTicketPageSize));
  const serviceNames = useMemo(
    () => new Map(data.services.map((service) => [service.id, service.name])),
    [data.services],
  );

  const onClaim = useCallback(
    async (ticketId: string) => {
      setClaimingId(ticketId);
      try {
        await claimTicket(ticketId);
        await queryClient.invalidateQueries({ queryKey: queryKeys.ticketLists });
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

  return {
    view: state.view,
    isStaff,
    inboxHidden: data.inboxHidden,
    hasGroupMembership: data.hasGroupMembership,
    inboxGroupCounts: data.inboxGroupCounts,
    filters: state.filters,
    setFilters: state.setFilters,
    setInboxTab: state.setInboxTab,
    setSearch: state.setSearch,
    page: state.page,
    setPage: state.setPage,
    totalPages,
    pageItems: data.pageItems,
    total: data.pageInfo.total,
    totalIsCapped: data.pageInfo.totalIsCapped,
    counts: data.counts,
    unroutedTickets: data.unroutedTickets,
    unroutedCount: data.unroutedTotal,
    unroutedPage: state.unroutedPage,
    unroutedTotalPages,
    setUnroutedPage: state.setUnroutedPage,
    serviceNames,
    services: data.services,
    catalogErrorKey: data.catalogErrorKey,
    unroutedErrorKey: data.unroutedErrorKey,
    membershipErrorKey: data.membershipErrorKey,
    isLoading: data.isLoading,
    errorKey: data.errorKey,
    setErrorKey: data.setErrorKey,
    claimingId,
    selectedIds: state.selectedIds,
    setSelectedIds: state.setSelectedIds,
    toggleSelected: state.toggleSelected,
    load: data.load,
    onClaim,
  };
}
