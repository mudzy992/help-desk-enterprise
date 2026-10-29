import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { announce } from "@/lib/a11y/announcer";
import { useShortcut } from "@/lib/shortcuts/shortcuts-context";
import { saveTicketListContext } from "@/lib/shortcuts/ticket-list-context";
import { useVirtualizer } from "@tanstack/react-virtual";
import { tableWrapClassName } from "@/components/ui/control";
import { TicketListCards } from "@/components/tickets/ticket-list-cards";
import { TicketListRow, directoryAssigneeNames } from "@/components/tickets/ticket-list-row";
import { TicketListTableHeader } from "@/components/tickets/ticket-list-table-header";
import { cn } from "@/lib/utils";
import type { TicketResponse } from "@/services/tickets-api";

export { directoryAssigneeNames };

/*
  Pulse list table: a calm surface with one loud element per row (the state
  badges). The ticket cell carries two lines — number plus title — so the row
  reads as a list item, not as eight unrelated columns; the title only brightens
  on hover, which keeps a full table from looking busy.
*/

interface TicketListTableProperties {
  readonly tickets: readonly TicketResponse[];
  readonly serviceNames: ReadonlyMap<string, string>;
  readonly originNames?: ReadonlyMap<string, string>;
  readonly assigneeNames?: ReadonlyMap<string, string>;
  readonly selectedIds: ReadonlySet<string>;
  readonly onToggleSelected: (ticketId: string) => void;
  readonly onTogglePage: (selected: boolean) => void;
}

const emptyAssigneeNames: ReadonlyMap<string, string> = new Map();

/**
 * Above this many rows the body is virtualized, keeping only the visible slice
 * in the DOM. Normal pages (including the paged group inbox) keep the plain
 * table, so a short result never introduces an unnecessary internal scrollbar.
 */
export const ticketListVirtualizationThreshold = 60;

const estimatedTicketRowHeightPx = 56;

export function TicketListTable({
  tickets,
  serviceNames,
  originNames,
  assigneeNames = emptyAssigneeNames,
  selectedIds,
  onToggleSelected,
  onTogglePage,
}: TicketListTableProperties) {
  const { t } = useTranslation();
  const rowOriginNames = originNames ?? emptyAssigneeNames;
  const allSelected = tickets.length > 0 && tickets.every((ticket) => selectedIds.has(ticket.id));
  const someSelected = !allSelected && tickets.some((ticket) => selectedIds.has(ticket.id));
  const isVirtualized = tickets.length > ticketListVirtualizationThreshold;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count: tickets.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimatedTicketRowHeightPx,
    overscan: 8,
    enabled: isVirtualized,
  });
  const virtualRows = isVirtualized ? virtualizer.getVirtualItems() : [];
  const renderedTickets = isVirtualized
    ? virtualRows.map((row, index) => ({
        ticket: tickets[row.index],
        virtualIndex: row.index,
        rowIndex: row.index,
        key: `${tickets[row.index]?.id ?? row.index}-${index}`,
      }))
    : tickets.map((ticket, index) => ({
        ticket,
        virtualIndex: undefined,
        rowIndex: index,
        key: ticket.id,
      }));
  const location = useLocation();
  const ticketIdsKey = tickets.map((ticket) => ticket.id).join(",");
  // 2.8 §4.1: remember the order for "next / previous ticket" on the detail page.
  useEffect(() => {
    saveTicketListContext({
      ids: ticketIdsKey.length === 0 ? [] : ticketIdsKey.split(","),
      listUrl: `${location.pathname}${location.search}`,
    });
  }, [ticketIdsKey, location.pathname, location.search]);

  const rowLinks = () =>
    Array.from(
      scrollRef.current?.querySelectorAll<HTMLAnchorElement>("a[data-ticket-row-link]") ?? [],
    );
  const focusedRowLink = () => {
    const active = document.activeElement;
    return active instanceof HTMLAnchorElement && active.dataset.ticketRowLink !== undefined
      ? active
      : null;
  };
  const moveRowFocus = (direction: 1 | -1) => {
    const links = rowLinks();
    if (links.length === 0) return;
    const current = focusedRowLink();
    const index = current === null ? (direction === 1 ? -1 : links.length) : links.indexOf(current);
    const next = links[Math.min(Math.max(index + direction, 0), links.length - 1)];
    next?.focus();
    next?.scrollIntoView({ block: "nearest" });
  };
  useShortcut("listNext", () => moveRowFocus(1));
  useShortcut("listPrevious", () => moveRowFocus(-1));
  useShortcut("listOpen", null);
  useShortcut("listOpenAlt", () => focusedRowLink()?.click());
  useShortcut("listToggle", () => {
    const id = focusedRowLink()?.dataset.ticketRowLink;
    if (id !== undefined) onToggleSelected(id);
  });

  const selectedCount = selectedIds.size;
  const previousSelectedCount = useRef(selectedCount);
  // 2.8 §3.3: bulk selection changes are announced (polite, coalesced).
  useEffect(() => {
    if (previousSelectedCount.current === selectedCount) {
      return;
    }
    previousSelectedCount.current = selectedCount;
    announce(t("a11y.list.selected", { count: selectedCount }), {
      dedupeKey: "ticket-list-selection",
      throttleMs: 0,
    });
  }, [selectedCount, t]);
  const measureRow = (element: Element | null) => {
    virtualizer.measureElement(element);
  };
  const rowProperties = {
    serviceNames,
    originNames: rowOriginNames,
    assigneeNames,
    selectedIds,
    onToggleSelected,
  };
  return (
    <>
      <TicketListCards
        tickets={tickets}
        serviceNames={serviceNames}
        originNames={rowOriginNames}
        assigneeNames={assigneeNames}
        selectedIds={selectedIds}
        onToggleSelected={onToggleSelected}
        onTogglePage={onTogglePage}
      />
      <div
        ref={scrollRef}
        className={cn(
          "hidden md:block",
          tableWrapClassName,
          "fade-in",
          isVirtualized && "max-h-[70vh] overflow-y-auto",
        )}
      >
        <table className="w-full min-w-[900px] text-left" aria-rowcount={tickets.length + 1}>
          <caption className="sr-only">{t("a11y.list.caption", { count: tickets.length })}</caption>
          <TicketListTableHeader
            allSelected={allSelected}
            someSelected={someSelected}
            isVirtualized={isVirtualized}
            onTogglePage={onTogglePage}
          />
          <tbody>
            {isVirtualized ? (
              <tr aria-hidden="true" style={{ height: virtualRows[0]?.start ?? 0 }} />
            ) : null}
            {renderedTickets.map(({ ticket, virtualIndex, rowIndex, key }) =>
              ticket === undefined ? null : (
                <TicketListRow
                  key={key}
                  ticket={ticket}
                  virtualIndex={virtualIndex}
                  rowIndex={rowIndex}
                  measureRef={virtualIndex === undefined ? undefined : measureRow}
                  {...rowProperties}
                />
              ),
            )}
            {isVirtualized ? (
              <tr
                aria-hidden="true"
                style={{
                  height: Math.max(
                    0,
                    virtualizer.getTotalSize() - (virtualRows[virtualRows.length - 1]?.end ?? 0),
                  ),
                }}
              />
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
