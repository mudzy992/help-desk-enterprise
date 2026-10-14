import { ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { TicketForwardIndicator } from "@/components/tickets/ticket-forward-indicator";
import { TicketMergeIndicator } from "@/components/tickets/ticket-merge-indicator";
import { TicketPriorityBadge, TicketStatusBadge } from "@/components/tickets/ticket-badges";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RelativeTime } from "@/components/ui/relative-time";
import { ticketIdClassName } from "@/components/ui/control";
import { translateText } from "@/lib/i18n/translate-text";
import { pickName } from "@/lib/tickets/ticket-names";
import { cn } from "@/lib/utils";
import type { TicketResponse } from "@/services/tickets-api";

interface TicketListCardsProperties {
  readonly tickets: readonly TicketResponse[];
  readonly serviceNames: ReadonlyMap<string, string>;
  readonly originNames: ReadonlyMap<string, string>;
  readonly assigneeNames: ReadonlyMap<string, string>;
  readonly selectedIds: ReadonlySet<string>;
  readonly onToggleSelected: (ticketId: string) => void;
  readonly onTogglePage: (selected: boolean) => void;
}

export function TicketListCards({
  tickets,
  serviceNames,
  originNames,
  assigneeNames,
  selectedIds,
  onToggleSelected,
  onTogglePage,
}: TicketListCardsProperties) {
  const { t, i18n } = useTranslation();
  const allSelected = tickets.length > 0 && tickets.every((ticket) => selectedIds.has(ticket.id));
  const someSelected = !allSelected && tickets.some((ticket) => selectedIds.has(ticket.id));
  return (
    <div className="space-y-2 md:hidden" data-testid="ticket-list-mobile-cards">
      <div className="rounded-lg border border-border bg-surface px-3 py-2">
        <Checkbox
          checked={allSelected}
          indeterminate={someSelected}
          onChange={(event) => onTogglePage(event.currentTarget.checked)}
          aria-label={t("tickets.bulk.select")}
          label={t("tickets.bulk.select")}
        />
      </div>
      {tickets.map((ticket) => (
        <article
          key={ticket.id}
          className={cn(
            "rounded-lg border border-border bg-surface p-3 shadow-card",
            selectedIds.has(ticket.id) && "border-primary/45 bg-primary/5",
          )}
          data-testid="ticket-list-mobile-card"
        >
          <div className="flex items-center gap-2">
            <Checkbox
              checked={selectedIds.has(ticket.id)}
              onChange={() => onToggleSelected(ticket.id)}
              aria-label={translateText(t, "tickets.bulk.selectRow", {
                number: ticket.ticketNumber,
              })}
            />
            {ticket.isConfidential ? (
              <ShieldAlert
                size={13}
                className="shrink-0 text-warning"
                aria-label={t("tickets.confidential.badge")}
              />
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
            <span className="ml-auto flex items-center gap-1">
              {ticket.isOverdue === true ? (
                <Badge tone="danger">{t("tickets.overdue.badge")}</Badge>
              ) : null}
              {ticket.isOverdue !== true && ticket.isAtRisk === true ? (
                <Badge tone="warning">{t("tickets.atRisk.badge")}</Badge>
              ) : null}
            </span>
          </div>
          <Link
            to={`/tickets/${ticket.id}`}
            className="mt-2 block text-[13px] font-medium leading-5 text-foreground hover:text-link"
          >
            {ticket.title}
          </Link>
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[11.5px]">
            <MobileMeta label={t("tickets.columns.service")}>
              {serviceNames.get(ticket.serviceId) ?? "—"}
            </MobileMeta>
            <MobileMeta label={t("tickets.columns.unit")}>
              {originNames.get(ticket.originUnitId) ?? "—"}
            </MobileMeta>
            <MobileMeta label={t("tickets.columns.assignment")}>
              <AssignmentSummary ticket={ticket} assigneeNames={assigneeNames} />
            </MobileMeta>
            <MobileMeta label={t("tickets.columns.updated")}>
              <RelativeTime value={ticket.updatedAt} locale={i18n.language} />
            </MobileMeta>
          </dl>
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/60 pt-2">
            <TicketStatusBadge status={ticket.status} />
            <TicketPriorityBadge priority={ticket.priority} showCriticalMark />
          </div>
        </article>
      ))}
    </div>
  );
}

function MobileMeta({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 flex min-w-0 items-center gap-1 truncate text-foreground/85">
        {children}
      </dd>
    </div>
  );
}

function AssignmentSummary({
  ticket,
  assigneeNames,
}: {
  readonly ticket: TicketResponse;
  readonly assigneeNames: ReadonlyMap<string, string>;
}) {
  const { t } = useTranslation();
  if (ticket.status === "UNROUTED" || ticket.assignedGroupId === null) {
    return <Badge tone="danger">{t("tickets.assignment.unrouted")}</Badge>;
  }
  const groupName = pickName(ticket.assignedGroupName) ?? t("tickets.detail.unknownGroup");
  const userName =
    ticket.assignedUserId === null
      ? null
      : pickName(ticket.assignedUserName, assigneeNames.get(ticket.assignedUserId));
  return (
    <>
      {userName === null ? null : <Avatar name={userName} size="xs" />}
      <span className="truncate">
        {userName === null ? groupName : `${groupName} · ${userName}`}
      </span>
    </>
  );
}
