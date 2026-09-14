import { Link, useNavigate } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { TicketOverdueBadge, TicketPriorityBadge, TicketStatusBadge } from "@/components/tickets/ticket-badges";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  tableHeadClassName,
  tableWrapClassName,
  ticketIdClassName,
} from "@/components/ui/control";
import { RelativeTime } from "@/components/ui/relative-time";
import { truncateIdentifier } from "@/lib/tickets/ticket-display";
import { useTicketText } from "@/lib/tickets/use-ticket-text";
import type { TicketResponse } from "@/services/tickets-api";

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
  const name = assigneeNames.get(ticket.assignedUserId)?.trim();
  return name !== undefined && name.length > 0 ? name : null;
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
  if (ticket.assignedUserId === null) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="tnum text-[12px] text-foreground/80">
          {truncateIdentifier(ticket.assignedGroupId)}
        </span>
        <Badge tone="info" dot={false}>
          {t("tickets.assignment.groupOnly")}
        </Badge>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <span className="tnum text-[12px] text-foreground/80">
        {truncateIdentifier(ticket.assignedGroupId)}
      </span>
      {assigneeName !== null ? (
        <>
          <span className="text-muted-foreground/50">·</span>
          <Avatar name={assigneeName} size="xs" />
        </>
      ) : (
        <span className="text-[12px] text-foreground/80">{t("tickets.assignment.assigned")}</span>
      )}
    </div>
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
  const { t, i18n } = useTicketText();
  const navigate = useNavigate();
  const allSelected = tickets.length > 0 && tickets.every((ticket) => selectedIds.has(ticket.id));
  return (
    <div className={tableWrapClassName}>
      <table className="w-full min-w-[900px] text-left">
        <thead>
          <tr className={`border-b border-border/70 ${tableHeadClassName}`}>
            <th className="w-10 px-4 py-2.5">
              <input
                type="checkbox"
                className="size-3.5"
                checked={allSelected}
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
        <tbody className="divide-y divide-border/50">
          {tickets.map((ticket) => (
            <tr
              key={ticket.id}
              className="group min-h-9 cursor-pointer transition-colors duration-150 hover:bg-elevated/40"
              onClick={() => navigate(`/tickets/${ticket.id}`)}
            >
              <td className="px-4 py-2.5" onClick={(event) => event.stopPropagation()}>
                <input
                  type="checkbox"
                  className="size-3.5"
                  checked={selectedIds.has(ticket.id)}
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
                  {ticket.isOverdue === true ? <TicketOverdueBadge /> : null}
                </div>
                <p className="mt-0.5 max-w-[340px] truncate text-[12.5px] text-foreground/90">
                  {ticket.title}
                </p>
              </td>
              <td className="px-4 py-2.5">
                <span className="text-[12px] text-muted-foreground">
                  {serviceNames.get(ticket.serviceId) ?? ticket.serviceId}
                </span>
              </td>
              <td className="px-4 py-2.5 text-[12px] text-muted-foreground">
                {originNames?.get(ticket.originUnitId) ??
                  truncateIdentifier(ticket.originUnitId)}
              </td>
              <td className="px-4 py-2.5">
                <TicketStatusBadge status={ticket.status} />
              </td>
              <td className="px-4 py-2.5">
                <TicketPriorityBadge priority={ticket.priority} showCriticalMark />
              </td>
              <td className="px-4 py-2.5">
                {assignmentCell(ticket, t, assigneeNames)}
              </td>
              <td className="px-4 py-2.5 text-right text-[12px] text-muted-foreground">
                <RelativeTime value={ticket.updatedAt} locale={i18n.language} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
