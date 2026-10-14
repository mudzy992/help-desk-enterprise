import { Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RelativeTime } from "@/components/ui/relative-time";
import { formatDurationMinutes } from "@/lib/tickets/ticket-display";
import { cn } from "@/lib/utils";
import type { TicketTimeLogResponse } from "@/services/tickets-collaboration-api";

interface TicketTimeLogRowProperties {
  readonly item: TicketTimeLogResponse;
  readonly locale: string;
  readonly nameOf: (userId: string | null | undefined) => string;
  readonly canEdit: boolean;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
}

export function TicketTimeLogRow({
  item,
  locale,
  nameOf,
  canEdit,
  onEdit,
  onDelete,
}: TicketTimeLogRowProperties) {
  const { t } = useTranslation();
  const name = nameOf(item.userId);
  const deleted = (item.deletedAt ?? null) !== null;
  const corrected = (item.correctedAt ?? null) !== null;

  return (
    <li
      data-testid="time-log-row"
      className={cn(
        "flex items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-surface-hover",
        item.endedAt === null && "bg-primary/6",
        deleted && "opacity-60",
      )}
    >
      <Avatar name={name} size="sm" />
      <div className="min-w-0 flex-1">
        <p className={cn("text-[12.5px] text-foreground/90", deleted && "line-through")}>{name}</p>
        <p className="text-[11px] text-muted-foreground">
          <RelativeTime value={item.startedAt} locale={locale} />
          {item.note ? <span> · {item.note}</span> : null}
        </p>
        <div className="mt-1 flex flex-wrap gap-1">
          {item.source === "MANUAL" ? (
            <Badge tone="info">{t("tickets.timeTracking.sourceManual")}</Badge>
          ) : null}
          {item.stopReason === "AUTO_IDLE" ? (
            <Badge tone="warning">{t("tickets.timeTracking.stopIdle")}</Badge>
          ) : null}
          {item.stopReason === "AUTO_MAX_DURATION" ? (
            <Badge tone="warning">{t("tickets.timeTracking.stopMax")}</Badge>
          ) : null}
          {item.stopReason === "AUTO_TICKET_CLOSED" ? (
            <Badge tone="neutral">{t("tickets.timeTracking.stopClosed")}</Badge>
          ) : null}
          {corrected ? (
            <span
              title={t("tickets.timeTracking.correctedTooltip", {
                user: nameOf(item.correctedByUserId),
                reason: item.correctionReason ?? "",
              })}
            >
              <Badge tone="neutral">{t("tickets.timeTracking.corrected")}</Badge>
            </span>
          ) : null}
          {deleted ? (
            <span
              title={t("tickets.timeTracking.deletedTooltip", {
                user: nameOf(item.deletedByUserId),
                reason: item.deleteReason ?? "",
              })}
            >
              <Badge tone="danger">{t("tickets.timeTracking.deleted")}</Badge>
            </span>
          ) : null}
        </div>
      </div>
      <Badge tone="neutral" className="tnum">
        {formatDurationMinutes(item.durationSeconds)}
      </Badge>
      {canEdit ? (
        <div className="flex items-center">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            data-testid="time-log-edit"
            aria-label={t("tickets.timeTracking.edit")}
            title={t("tickets.timeTracking.edit")}
            onClick={onEdit}
          >
            <Pencil size={13} />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            aria-label={t("tickets.timeTracking.delete")}
            title={t("tickets.timeTracking.delete")}
            onClick={onDelete}
          >
            <Trash2 size={13} />
          </Button>
        </div>
      ) : null}
    </li>
  );
}
