import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Pause } from "lucide-react";
import { useTranslation } from "react-i18next";
import { TicketConfidentialBadge, TicketPriorityBadge, TicketStatusBadge } from "@/components/tickets/ticket-badges";
import { TicketConfidentialBanner } from "@/components/tickets/ticket-confidential-banner";
import { TicketDetailHeaderActions } from "@/components/tickets/ticket-detail-header-actions";
import { TicketResolveFields } from "@/components/tickets/ticket-resolve-fields";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { RelativeTime } from "@/components/ui/relative-time";
import type { TicketResponse, TicketStatus, UpdateTicketInput } from "@/services/tickets-api";

/*
  Pulse ticket header.

  The old header put the ticket number, the badges and the title on one crowded
  line. Here the number becomes a small identifier, the title is the only
  large text on the page, and the requester / origin / time drop to a quiet
  meta row — the shape people already read on the list screens.
*/

interface TicketDetailAssignUser {
  readonly id: string;
  readonly displayName: string;
}

interface TicketDetailHeaderProperties {
  readonly ticket: TicketResponse;
  readonly serviceName: string;
  readonly originName: string;
  readonly requesterName: string;
  readonly canChangeStatus: boolean;
  readonly canClaim: boolean;
  readonly canRequestRemote: boolean;
  readonly claiming: boolean;
  readonly savingStatus: boolean;
  readonly reopening: boolean;
  readonly assigning: boolean;
  readonly canSplit: boolean;
  readonly canForward: boolean;
  readonly canAssign: boolean;
  readonly assignableUsers: readonly TicketDetailAssignUser[];
  readonly onClaim: () => void;
  readonly onAssignUser: (userId: string) => void;
  readonly onStatusChange: (status: TicketStatus, extras?: UpdateTicketInput) => void;
  readonly onReopen: () => void;
  readonly onSplit: () => void;
  readonly onForward: () => void;
}

function metaSeparator() {
  return <span className="text-border">·</span>;
}

export function TicketDetailHeader({
  ticket,
  serviceName,
  originName,
  requesterName,
  canChangeStatus,
  canClaim,
  canRequestRemote,
  claiming,
  savingStatus,
  reopening,
  assigning,
  canSplit,
  canForward,
  canAssign,
  assignableUsers,
  onClaim,
  onAssignUser,
  onStatusChange,
  onReopen,
  onSplit,
  onForward,
}: TicketDetailHeaderProperties) {
  const { t, i18n } = useTranslation();
  const [pendingStatus, setPendingStatus] = useState<TicketStatus | null>(null);
  const [closeCode, setCloseCode] = useState(ticket.closePolicy?.closeCode?.key ?? "");
  const [resolutionNote, setResolutionNote] = useState(ticket.closePolicy?.resolutionNote ?? "");
  const formVersionLabel = t("tickets.detail.formVersion").toLowerCase();
  const isPaused =
    ticket.status === "WAITING_FOR_USER" || ticket.status === "PENDING_APPROVAL";
  return (
    <div className="page-in">
      <div className="mb-4 flex items-center gap-2 text-[12px] text-muted-foreground">
        <Link
          to="/tickets"
          className="flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors duration-150 hover:bg-surface-hover hover:text-foreground"
        >
          <ArrowLeft size={13} /> {t("tickets.title")}
        </Link>
        <span className="text-border">/</span>
        <span>{serviceName}</span>
        <span className="text-border">/</span>
        <span className="tnum text-foreground/80">{ticket.ticketNumber}</span>
      </div>
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="tnum text-[11.5px] font-medium tracking-[0.02em] text-muted-foreground">
                {ticket.ticketNumber}
              </span>
              <TicketStatusBadge status={ticket.status} />
              <TicketPriorityBadge priority={ticket.priority} showCriticalMark />
              {isPaused ? (
                <Badge tone="warning" dot>
                  {t("tickets.detail.pauseBadge")}
                </Badge>
              ) : null}
              {ticket.isConfidential ? <TicketConfidentialBadge /> : null}
            </div>
            <h1 className="mt-2 max-w-3xl text-[16px] font-semibold leading-6 text-foreground">
              {ticket.title}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Avatar name={requesterName} size="xs" />
                <span className="text-foreground/80">{requesterName}</span>
              </span>
              {metaSeparator()}
              <span>{originName}</span>
              {metaSeparator()}
              <RelativeTime value={ticket.createdAt} locale={i18n.language} />
              {ticket.formVersionNumber === null || ticket.formVersionNumber === undefined ? null : (
                <>
                  {metaSeparator()}
                  <span>
                    {formVersionLabel}{" "}
                    <span className="tnum">
                      {t("tickets.detail.formVersionValue", { version: ticket.formVersionNumber })}
                    </span>
                  </span>
                </>
              )}
            </div>
          </div>
          <TicketDetailHeaderActions
            ticket={ticket}
            canChangeStatus={canChangeStatus}
            canClaim={canClaim}
            canRequestRemote={canRequestRemote}
            claiming={claiming}
            savingStatus={savingStatus}
            reopening={reopening}
            assigning={assigning}
            canSplit={canSplit}
            canForward={canForward}
            canAssign={canAssign}
            assignableUsers={assignableUsers}
            onClaim={onClaim}
            onAssignUser={onAssignUser}
            onStatusChange={onStatusChange}
            onReopen={onReopen}
            onSplit={onSplit}
            onForward={onForward}
            onRequestClose={setPendingStatus}
          />
        </div>
        {ticket.isConfidential ? <TicketConfidentialBanner /> : null}
        {ticket.status === "WAITING_FOR_USER" ? (
          <p className="flex flex-wrap items-center gap-2 border-t border-warning/25 bg-warning/6 px-5 py-2.5 text-[12px] text-foreground/90">
            <Pause size={14} className="shrink-0 text-warning" aria-hidden="true" />
            <Badge tone="warning">{t("tickets.detail.pauseBadge")}</Badge>
            <span>{t("tickets.detail.waitingForUserHint")}</span>
          </p>
        ) : null}
        {ticket.status === "PENDING_APPROVAL" ? (
          <p className="flex flex-wrap items-center gap-2 border-t border-warning/25 bg-warning/6 px-5 py-2.5 text-[12px] text-foreground/90">
            <Pause size={14} className="shrink-0 text-warning" aria-hidden="true" />
            <Badge tone="warning">{t("tickets.detail.pauseBadge")}</Badge>
            <span>{t("tickets.detail.pendingApprovalHint")}</span>
          </p>
        ) : null}
        {ticket.status === "ARCHIVED" ? (
          <p className="border-t border-border/70 px-5 py-2.5 text-[12px] text-muted-foreground">
            {t("tickets.detail.archivedHint")}
          </p>
        ) : null}
        {pendingStatus !== null ? (
          <div className="border-t border-border/70 bg-elevated/40 px-5 py-3">
            <TicketResolveFields
              pendingStatus={pendingStatus}
              closePolicy={ticket.closePolicy}
              closeCode={closeCode}
              resolutionNote={resolutionNote}
              saving={savingStatus}
              onCloseCodeChange={setCloseCode}
              onResolutionNoteChange={setResolutionNote}
              onConfirm={() => {
                onStatusChange(pendingStatus, {
                  closeCode: closeCode.length > 0 ? closeCode : undefined,
                  resolutionNote: resolutionNote.length > 0 ? resolutionNote : undefined,
                });
              }}
              onCancel={() => setPendingStatus(null)}
            />
          </div>
        ) : null}
      </Card>
    </div>
  );
}
