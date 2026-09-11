import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { formatDurationMinutes, formatRelativeTicketTime } from "@/lib/tickets/ticket-display";
import { ticketText } from "@/lib/tickets/ticket-text";
import type { TicketTimeLogResponse } from "@/services/tickets-collaboration-api";

interface TicketTimeTrackingPanelProperties {
  readonly items: readonly TicketTimeLogResponse[];
  readonly visible: boolean;
  readonly currentUserId: string | null;
  readonly isSaving: boolean;
  readonly onStart: () => void;
  readonly onStop: (timeLogId: string) => void;
}

export function TicketTimeTrackingPanel({
  items,
  visible,
  currentUserId,
  isSaving,
  onStart,
  onStop,
}: TicketTimeTrackingPanelProperties) {
  const { t, i18n } = useTranslation();
  if (!visible) {
    return null;
  }
  const totalSeconds = items.reduce((sum, item) => sum + (item.durationSeconds ?? 0), 0);
  const active = items.find(
    (item) => item.endedAt === null && item.userId === currentUserId,
  );
  return (
    <Card>
      <CardHeader
        title={t("tickets.detail.timeLogged")}
        subtitle={ticketText(t, "tickets.detail.timeTotal", {
          total: formatDurationMinutes(totalSeconds),
        })}
        actions={
          active ? (
            <Button type="button" size="xs" disabled={isSaving} onClick={() => onStop(active.id)}>
              {t("tickets.detail.stopTimer")}
            </Button>
          ) : (
            <Button type="button" size="xs" variant="outline" disabled={isSaving} onClick={onStart}>
              {t("tickets.detail.startTimer")}
            </Button>
          )
        }
      />
      {items.length === 0 ? (
        <p className="px-4 py-8 text-center text-[12.5px] text-muted-foreground">
          {t("tickets.detail.noTimeLogs")}
        </p>
      ) : (
        <ul className="divide-y divide-border/50">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 px-4 py-3">
              <Avatar name={item.userId} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] text-foreground/90">
                  {formatRelativeTicketTime(item.startedAt, i18n.language)}
                </p>
                <p className="text-[11px] text-muted-foreground tnum">
                  {item.endedAt === null
                    ? t("tickets.detail.startTimer")
                    : formatRelativeTicketTime(item.startedAt, i18n.language)}
                </p>
              </div>
              <Badge tone="neutral" className="tnum">
                {formatDurationMinutes(item.durationSeconds)}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
