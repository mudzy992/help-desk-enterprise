import { useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ShieldAlert } from "lucide-react";
import { TicketAtRiskBadge, TicketOverdueBadge, TicketPriorityBadge, TicketStatusBadge } from "@/components/tickets/ticket-badges";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  tableHeadClassName,
  tableRowClassName,
  tableWrapClassName,
  ticketIdClassName,
} from "@/components/ui/control";
import { TicketForwardIndicator } from "@/components/tickets/ticket-forward-indicator";
import { TicketMergeIndicator } from "@/components/tickets/ticket-merge-indicator";
import { RelativeTime } from "@/components/ui/relative-time";
import { pickName } from "@/lib/tickets/ticket-names";
import { useTicketText } from "@/lib/tickets/use-ticket-text";
import { cn } from "@/lib/utils";
import type { TicketResponse } from "@/services/tickets-api";

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
 * Faza 3.3 (plan §3.3, item 5): above this many rows the body is virtualized, so
 * a long list (the group inbox is not paged) keeps ~60 rows in the DOM. Shorter
 * lists keep the plain table — no internal scrollbar appears for a normal page.
 */
export const ticketListVirtualizationThreshold = 60;

const estimatedTicketRowHeightPx = 56;

export function directoryAssigneeNames(
  users: readonly { id: string; displayName: string }[],
): ReadonlyMap<string, string> {
  return new Map(
    users.flatMap((user) => {
      const name = user.displayName.trim();
      return name.length > 0 ? [[user.id, name] as const] : [];
    }),
  );
}

function assigneeDirectoryName(
  ticket: TicketResponse,
  assigneeNames: ReadonlyMap<string, string>,
): string | null {
  if (ticket.assignedUserId === null) {
    return null;
  }
  return pickName(ticket.assignedUserName, assigneeNames.get(ticket.assignedUserId));
}

function assignmentCell(
  ticket: TicketResponse,
  t: (key: string) => string,
  assigneeNames: ReadonlyMap<string, string>,
) {
  if (ticket.status === "UNROUTED" || ticket.assignedGroupId === null) {
    return <Badge tone="danger">{t("tickets.assignment.unrouted")}</Badge>;
  }
  const assigneeName = assigneeDirectoryName(ticket, assigneeNames);
  const groupName = pickName(ticket.assignedGroupName) ?? t("tickets.detail.unknownGroup");
  if (ticket.assignedUserId === null) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="truncate text-[12px] text-foreground/80">{groupName}</span>
        <Badge tone="info" dot={false}>
          {t("tickets.assignment.groupOnly")}
        </Badge>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <span className="truncate text-[12px] text-foreground/80">{groupName}</span>
      {assigneeName !== null ? (
        <>
          <span className="text-muted-foreground/40">·</span>
          <Avatar name={assigneeName} size="xs" />
        </>
      ) : (
        <span className="text-[12px] text-foreground/80">{t("tickets.assignment.assigned")}</span>
      )}
    </div>
  );
}

type TicketListRowProperties = {
  readonly ticket: TicketResponse;
  readonly serviceNames: ReadonlyMap<string, string>;
  readonly originNames: ReadonlyMap<string, string>;
  readonly assigneeNames: ReadonlyMap<string, string>;
  readonly selectedIds: ReadonlySet<string>;
  readonly onToggleSelected: (ticketId: string) => void;
  /** Set only in the virtualized body, where the row must be measured. */
  readonly virtualIndex?: number;
  /** The virtualizer measures the real row height through this ref. */
  readonly measureRef?: (element: Element | null) => void;
};

function TicketListRow({
  ticket,
  serviceNames,
  originNames,
  assigneeNames,
  selectedIds,
  onToggleSelected,
  virtualIndex,
  measureRef,
}: TicketListRowProperties) {
  const { t, i18n } = useTicketText();
  const navigate = useNavigate();
  const isSelected = selectedIds.has(ticket.id);
  return (
    <tr
      className={cn(
        tableRowClassName,
        "cursor-pointer",
        isSelected && "bg-primary/6 hover:bg-primary/8",
      )}
      data-index={virtualIndex}
      ref={measureRef}
      onClick={() => navigate(`/tickets/${ticket.id}`)}
    >
      <td className="px-4 py-2.5" onClick={(event) => event.stopPropagation()}>
        <Checkbox
          checked={isSelected}
          onChange={() => onToggleSelected(ticket.id)}
          aria-label={t("tickets.bulk.selectRow", { number: ticket.ticketNumber })}
        />
      </td>
      <td className="px-2 py-2.5">
        <div className="flex items-center gap-2">
          {ticket.isConfidential ? (
            <ShieldAlert size={13} className="shrink-0 text-warning" aria-hidden="true" />
          ) : null}
          <Link to={`/tickets/${ticket.id}`} className={ticketIdClassName}>
            {ticket.ticketNumber}
          </Link>
          <TicketForwardIndicator ticket={ticket} />
          <TicketMergeIndicator ticket={ticket} />
          {ticket.isOverdue === true ? <TicketOverdueBadge /> : null}
          {ticket.isOverdue !== true && ticket.isAtRisk === true ? (
            <TicketAtRiskBadge />
          ) : null}
        </div>
        <p className="mt-0.5 max-w-[340px] truncate text-[12.5px] text-muted-foreground transition-colors duration-150 group-hover:text-foreground/95">
          {ticket.title}
        </p>
      </td>
      <td className="px-4 py-2.5">
        <span className="text-[12px] text-muted-foreground">
          {serviceNames.get(ticket.serviceId) ?? "—"}
        </span>
      </td>
      <td className="px-4 py-2.5">
        <span className="text-[12px] text-muted-foreground">
          {originNames.get(ticket.originUnitId) ?? "—"}
        </span>
      </td>
      <td className="px-4 py-2.5">
        <TicketStatusBadge status={ticket.status} />
      </td>
      <td className="px-4 py-2.5">
        <TicketPriorityBadge priority={ticket.priority} showCriticalMark />
      </td>
      <td className="px-4 py-2.5">{assignmentCell(ticket, t, assigneeNames)}</td>
      <td className="whitespace-nowrap px-4 py-2.5 text-right text-[11.5px] text-muted-foreground">
        <RelativeTime value={ticket.updatedAt} locale={i18n.language} />
      </td>
    </tr>
  );
}

export function TicketListTable({
  tickets,
  serviceNames,
  originNames,
  assigneeNames = emptyAssigneeNames,
  selectedIds,
  onToggleSelected,
  onTogglePage,
}: TicketListTableProperties) {
  const { t } = useTicketText();
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
        key: `${tickets[row.index]?.id ?? row.index}-${index}`,
      }))
    : tickets.map((ticket) => ({ ticket, virtualIndex: undefined, key: ticket.id }));
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
    <div
      ref={scrollRef}
      className={cn(
        tableWrapClassName,
        "fade-in",
        isVirtualized && "max-h-[70vh] overflow-y-auto",
      )}
    >
      <table className="w-full min-w-[900px] text-left">
        <thead className={isVirtualized ? "sticky top-0 z-10 bg-surface" : undefined}>
          <tr className={cn("border-b border-border/70 bg-elevated/60", tableHeadClassName)}>
            <th className="w-10 px-4 py-2.5">
              <Checkbox
                checked={allSelected}
                indeterminate={someSelected}
                onChange={(event) => onTogglePage(event.target.checked)}
                aria-label={t("tickets.bulk.select")}
              />
            </th>
            <th className="px-2 py-2.5 font-medium">{t("tickets.columns.ticket")}</th>
            <th className="px-4 py-2.5 font-medium">{t("tickets.columns.service")}</th>
            <th className="px-4 py-2.5 font-medium">{t("tickets.columns.unit")}</th>
            <th className="px-4 py-2.5 font-medium">{t("tickets.columns.status")}</th>
            <th className="px-4 py-2.5 font-medium">{t("tickets.columns.priority")}</th>
            <th className="px-4 py-2.5 font-medium">{t("tickets.columns.assignment")}</th>
            <th className="px-4 py-2.5 text-right font-medium">{t("tickets.columns.updated")}</th>
          </tr>
        </thead>
        <tbody>
          {isVirtualized ? (
            <tr aria-hidden="true" style={{ height: virtualRows[0]?.start ?? 0 }} />
          ) : null}
          {renderedTickets.map(({ ticket, virtualIndex, key }) =>
            ticket === undefined ? null : (
              <TicketListRow
                key={key}
                ticket={ticket}
                virtualIndex={virtualIndex}
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
  );
}
