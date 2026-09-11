import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatTicketTimestamp } from "@/lib/tickets/ticket-display";
import type { TicketTimeLogResponse } from "@/services/tickets-collaboration-api";

interface TicketTimeTrackingPanelProperties {
  readonly items: readonly TicketTimeLogResponse[];
  readonly visible: boolean;
  readonly currentUserId: string | null;
  readonly isSaving: boolean;
  readonly onStart: () => void;
  readonly onStop: (timeLogId: string) => void;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) {
    return "—";
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
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
  const active = items.find(
    (item) => item.endedAt === null && item.userId === currentUserId,
  );
  return (
    <Card className="grid gap-2 px-4 py-3.5">
      <h3 className="text-[13.5px] font-semibold text-foreground">{t("tickets.detail.time")}</h3>
      {items.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">{t("tickets.detail.noTimeLogs")}</p>
      ) : (
        <ul className="grid gap-1 text-[12px] text-muted-foreground tnum">
          {items.map((item) => (
            <li key={item.id}>
              {formatTicketTimestamp(item.startedAt, i18n.language)} · {formatDuration(item.durationSeconds)}
            </li>
          ))}
        </ul>
      )}
      {active ? (
        <Button type="button" size="sm" disabled={isSaving} onClick={() => onStop(active.id)}>
          {t("tickets.detail.stopTimer")}
        </Button>
      ) : (
        <Button type="button" size="sm" variant="outline" disabled={isSaving} onClick={onStart}>
          {t("tickets.detail.startTimer")}
        </Button>
      )}
    </Card>
  );
}
