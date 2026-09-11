import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Pause } from "lucide-react";
import { useTranslation } from "react-i18next";
import { TicketConfidentialBadge, TicketPriorityBadge, TicketStatusBadge } from "@/components/tickets/ticket-badges";
import { TicketConfidentialBanner } from "@/components/tickets/ticket-confidential-banner";
import { TicketDetailHeaderActions } from "@/components/tickets/ticket-detail-header-actions";
import { TicketResolveFields } from "@/components/tickets/ticket-resolve-fields";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { RelativeTime } from "@/components/ui/relative-time";
import { truncateIdentifier } from "@/lib/tickets/ticket-display";
import type { TicketResponse, TicketStatus, UpdateTicketInput } from "@/services/tickets-api";

interface TicketDetailHeaderProperties {
  readonly ticket: TicketResponse;
  readonly serviceName: string;
  readonly originName: string;
  readonly requesterName: string;
  readonly canChangeStatus: boolean;
  readonly claiming: boolean;
  readonly savingStatus: boolean;
  readonly reopening: boolean;
  readonly canSplit: boolean;
  readonly onClaim: () => void;
  readonly onStatusChange: (status: TicketStatus, extras?: UpdateTicketInput) => void;
  readonly onReopen: () => void;
  readonly onSplit: () => void;
}

export function TicketDetailHeader({
  ticket,
  serviceName,
  originName,
  requesterName,
  canChangeStatus,
  claiming,
  savingStatus,
  reopening,
  canSplit,
  onClaim,
  onStatusChange,
  onReopen,
  onSplit,
}: TicketDetailHeaderProperties) {
  const { t, i18n } = useTranslation();
  const [pendingStatus, setPendingStatus] = useState<TicketStatus | null>(null);
  const [closeCode, setCloseCode] = useState(ticket.closePolicy?.closeCode?.key ?? "");
  const [resolutionNote, setResolutionNote] = useState(ticket.closePolicy?.resolutionNote ?? "");
  const formVersionLabel = t("tickets.detail.formVersion").toLowerCase();
  return (
    <div>
      <div className="mb-4 flex items-center gap-2 text-[12px] text-muted-foreground">
        <Link
          to="/tickets"
          className="flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors duration-150 hover:bg-elevated hover:text-foreground"
        >
          <ArrowLeft size={13} /> {t("tickets.title")}
        </Link>
        <span className="text-border">/</span>
        <span>{serviceName}</span>
        <span className="text-border">/</span>
        <span className="tnum text-foreground/80">{ticket.ticketNumber}</span>
      </div>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="tnum text-[16px] font-semibold text-foreground">
                {ticket.ticketNumber}
              </h1>
              <TicketStatusBadge status={ticket.status} />
              <TicketPriorityBadge priority={ticket.priority} showCriticalMark />
              {ticket.isConfidential ? <TicketConfidentialBadge /> : null}
            </div>
            <p className="mt-1.5 max-w-2xl text-[14.5px] leading-5 text-foreground/95">
              {ticket.title}
            </p>
            <p className="mt-1.5 text-[12px] text-muted-foreground">
              {t("tickets.detail.reportedBy")}{" "}
              <span className="text-foreground/80">{requesterName}</span>
              {" · "}
              {originName}
              {" · "}
              <RelativeTime value={ticket.createdAt} locale={i18n.language} />
              {" · "}
              {formVersionLabel}{" "}
              <span className="tnum">{truncateIdentifier(ticket.formVersionRef)}</span> ({serviceName})
            </p>
          </div>
          <TicketDetailHeaderActions
            ticket={ticket}
            canChangeStatus={canChangeStatus}
            claiming={claiming}
            savingStatus={savingStatus}
            reopening={reopening}
            canSplit={canSplit}
            onClaim={onClaim}
            onStatusChange={onStatusChange}
            onReopen={onReopen}
            onSplit={onSplit}
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
          <div className="border-t border-border/70 px-5 py-3">
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
