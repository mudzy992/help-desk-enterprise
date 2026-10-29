import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import {
  TicketAtRiskBadge,
  TicketOverdueBadge,
  TicketPriorityBadge,
  TicketStatusBadge,
} from "@/components/tickets/ticket-badges";
import { TicketForwardIndicator } from "@/components/tickets/ticket-forward-indicator";
import { TicketMergeIndicator } from "@/components/tickets/ticket-merge-indicator";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ticketIdClassName, tableRowClassName } from "@/components/ui/control";
import { RelativeTime } from "@/components/ui/relative-time";
import { translateText } from "@/lib/i18n/translate-text";
import { pickName } from "@/lib/tickets/ticket-names";
import { cn } from "@/lib/utils";
import type { TicketResponse } from "@/services/tickets-api";

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
  t: TFunction<"common">,
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
          <span className="text-muted-foreground">·</span>
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
  /** 0-based position in the full list (2.8 §3.3, aria-rowindex). */
  readonly rowIndex: number;
  /** The virtualizer measures the real row height through this ref. */
  readonly measureRef?: (element: Element | null) => void;
};

export function TicketListRow({
  ticket,
  serviceNames,
  originNames,
  assigneeNames,
  selectedIds,
  onToggleSelected,
  virtualIndex,
  rowIndex,
  measureRef,
}: TicketListRowProperties) {
  const { t, i18n } = useTranslation();
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
      aria-rowindex={rowIndex + 2}
      ref={measureRef}
      /* a11y-row-link: the click is a mouse shortcut; keyboard and screen
         readers use the ticket-number Link in the row. */
      onClick={() => navigate(`/tickets/${ticket.id}`)}
    >
      <td className="px-4 py-2.5" onClick={(event) => event.stopPropagation()}>
        <Checkbox
          checked={isSelected}
          onChange={() => onToggleSelected(ticket.id)}
          aria-label={translateText(t, "tickets.bulk.selectRow", { number: ticket.ticketNumber })}
        />
      </td>
      <td className="px-2 py-2.5">
        <div className="flex items-center gap-2">
          {ticket.isConfidential ? (
            <ShieldAlert size={13} className="shrink-0 text-warning" aria-hidden="true" />
          ) : null}
          <Link
            to={`/tickets/${ticket.id}`}
            className={ticketIdClassName}
            data-ticket-row-link={ticket.id}
          >
            {ticket.ticketNumber}
          </Link>
          <TicketForwardIndicator ticket={ticket} />
          <TicketMergeIndicator ticket={ticket} />
          {ticket.isOverdue === true ? <TicketOverdueBadge /> : null}
          {ticket.isOverdue !== true && ticket.isAtRisk === true ? <TicketAtRiskBadge /> : null}
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
