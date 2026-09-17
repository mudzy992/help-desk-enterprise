import { Bell, Flame, UserCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { TicketAtRiskBadge, TicketOverdueBadge, TicketPriorityBadge, TicketStatusBadge } from "@/components/tickets/ticket-badges";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ticketIdClassName } from "@/components/ui/control";
import { EmptyState } from "@/components/ui/empty-state";
import { RelativeTime } from "@/components/ui/relative-time";
import { canShowClaimAction } from "@/lib/tickets/ticket-actions";
import { TICKET_PRIORITY_META } from "@/lib/theme/semantic-meta";
import { unroutedInboxTabKey } from "@/lib/tickets/inbox-view-tabs";
import type { TicketResponse } from "@/services/tickets-api";

interface TicketInboxListProperties {
  readonly activeTab: string;
  readonly tickets: readonly TicketResponse[];
  readonly serviceNames: ReadonlyMap<string, string>;
  readonly originNames: ReadonlyMap<string, string>;
  readonly requesterNames: ReadonlyMap<string, string>;
  readonly claimingId: string | null;
  readonly onClaim: (ticketId: string) => void;
}

export function TicketInboxList({
  activeTab,
  tickets,
  serviceNames,
  originNames,
  requesterNames,
  claimingId,
  onClaim,
}: TicketInboxListProperties) {
  const { t, i18n } = useTranslation();
  const isUnroutedTab = activeTab === unroutedInboxTabKey;
  return (
    <>
      <Card>
        {tickets.length === 0 ? (
          <EmptyState
            title={
              isUnroutedTab
                ? t("tickets.inboxUnroutedEmptyTitle")
                : t("tickets.inboxEmptyTitle")
            }
            body={
              isUnroutedTab
                ? t("tickets.inboxUnroutedEmptyBody")
                : t("tickets.inboxEmptyBody")
            }
          />
        ) : (
          <ul className="divide-y divide-border/50">
            {tickets.map((ticket) => (
              <InboxTicketRow
                key={ticket.id}
                ticket={ticket}
                serviceNames={serviceNames}
                originNames={originNames}
                requesterNames={requesterNames}
                locale={i18n.language}
                claimingId={claimingId}
                claimLabel={
                  claimingId === ticket.id ? t("tickets.claiming") : t("tickets.claim")
                }
                onClaim={onClaim}
              />
            ))}
          </ul>
        )}
      </Card>
      <p className="mt-3 flex items-center gap-2 text-[11.5px] text-muted-foreground/70">
        <Bell size={12} aria-hidden="true" />
        {t("tickets.inboxClaimHint")}
      </p>
    </>
  );
}

function InboxTicketRow({
  ticket,
  serviceNames,
  originNames,
  requesterNames,
  locale,
  claimingId,
  claimLabel,
  onClaim,
}: {
  readonly ticket: TicketResponse;
  readonly serviceNames: ReadonlyMap<string, string>;
  readonly originNames: ReadonlyMap<string, string>;
  readonly requesterNames: ReadonlyMap<string, string>;
  readonly locale: string;
  readonly claimingId: string | null;
  readonly claimLabel: string;
  readonly onClaim: (ticketId: string) => void;
}) {
  const navigate = useNavigate();
  const meta = inboxRowMeta(ticket, serviceNames, originNames, requesterNames);
  return (
    <li className="flex items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-elevated/40">
      {ticket.priority === "CRITICAL" ? (
        <Flame size={15} className="shrink-0 text-danger" aria-hidden="true" />
      ) : (
        <span
          className="size-[15px] shrink-0 rounded-full border-2"
          style={{ borderColor: TICKET_PRIORITY_META[ticket.priority].dot }}
        />
      )}
      <button
        type="button"
        onClick={() => navigate(`/tickets/${ticket.id}`)}
        className="min-w-0 flex-1 text-left"
      >
        <p className="flex items-center gap-2">
          <span className={ticketIdClassName}>{ticket.ticketNumber}</span>
          <span className="truncate text-[13px] font-medium text-foreground/95">
            {ticket.title}
          </span>
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-muted-foreground">
          {meta.map((part, index) => (
            <span key={`${ticket.id}-${index}`} className="contents">
              {index > 0 ? <span className="text-border">·</span> : null}
              <span>{part}</span>
            </span>
          ))}
          {meta.length > 0 ? <span className="text-border">·</span> : null}
          <RelativeTime value={ticket.createdAt} locale={locale} />
        </p>
      </button>
      <div className="hidden items-center gap-1.5 md:flex">
        {ticket.isOverdue === true ? <TicketOverdueBadge /> : null}
        {ticket.isOverdue !== true && ticket.isAtRisk === true ? (
          <TicketAtRiskBadge />
        ) : null}
        <TicketStatusBadge status={ticket.status} />
        <TicketPriorityBadge priority={ticket.priority} />
      </div>
      {canShowClaimAction(ticket) ? (
        <Button
          variant="primary"
          size="sm"
          disabled={claimingId === ticket.id}
          onClick={() => onClaim(ticket.id)}
        >
          <UserCheck size={13} />
          {claimLabel}
        </Button>
      ) : null}
    </li>
  );
}

function inboxRowMeta(
  ticket: TicketResponse,
  serviceNames: ReadonlyMap<string, string>,
  originNames: ReadonlyMap<string, string>,
  requesterNames: ReadonlyMap<string, string>,
): readonly string[] {
  const parts: string[] = [];
  const service = serviceNames.get(ticket.serviceId);
  const origin = originNames.get(ticket.originUnitId);
  const requester = requesterNames.get(ticket.requesterId)?.trim();
  if (service !== undefined && service.length > 0) {
    parts.push(service);
  }
  if (origin !== undefined && origin.length > 0) {
    parts.push(origin);
  }
  if (requester !== undefined && requester.length > 0) {
    parts.push(requester);
  }
  return parts;
}
