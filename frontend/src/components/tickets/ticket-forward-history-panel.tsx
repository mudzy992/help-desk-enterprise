import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { RelativeTime } from "@/components/ui/relative-time";
import { ticketText } from "@/lib/tickets/ticket-text";
import {
  listForwardHistory,
  type ForwardHistoryItem,
} from "@/services/tickets-forwarding-api";

interface TicketForwardHistoryPanelProperties {
  readonly ticketId: string;
  /** Changes whenever the ticket changes, so a new forward is picked up. */
  readonly versionKey: string;
  readonly visible: boolean;
}

/** Package 1.1: the ticket's route between groups and OUs (staff only). */
export function TicketForwardHistoryPanel({
  ticketId,
  versionKey,
  visible,
}: TicketForwardHistoryPanelProperties) {
  const { t, i18n } = useTranslation();
  const [items, setItems] = useState<readonly ForwardHistoryItem[]>([]);

  useEffect(() => {
    if (!visible) {
      setItems([]);
      return;
    }
    let active = true;
    listForwardHistory(ticketId)
      .then((response) => {
        if (active) {
          setItems(response);
        }
      })
      // History is informational; a failure must not break the ticket screen.
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [ticketId, versionKey, visible]);

  if (!visible || items.length === 0) {
    return null;
  }
  return (
    <Card className="fade-in" data-testid="forward-history">
      <CardHeader
        title={t("tickets.forward.historyTitle")}
        subtitle={ticketText(t, "tickets.forward.historyCount", { count: items.length })}
      />
      <ol className="grid gap-3 px-4 py-4">
        {items.map((item) => (
          <li key={item.id} className="grid gap-1 text-[12px]">
            <div className="flex flex-wrap items-center gap-1.5 text-foreground">
              <span>{item.fromGroupName ?? t("tickets.forward.noGroup")}</span>
              <ArrowRight size={12} aria-hidden="true" className="text-muted-foreground" />
              <span className="font-medium">{item.toGroupName}</span>
              {item.fromGroupId === item.toGroupId ? (
                <Badge tone="info">{t("tickets.forward.reassignBadge")}</Badge>
              ) : null}
              {item.isCrossOu ? (
                <Badge tone="warning">{t("tickets.forward.crossOuBadge")}</Badge>
              ) : null}
              {item.viaBulk ? <Badge tone="neutral">{t("tickets.forward.bulkBadge")}</Badge> : null}
            </div>
            {item.isCrossOu && (item.fromUnitName || item.toUnitName) ? (
              <div className="text-[11.5px] text-muted-foreground">
                {item.fromUnitName ?? "—"} → {item.toUnitName ?? "—"}
              </div>
            ) : null}
            {item.toUserName ? (
              <div className="text-[11.5px] text-muted-foreground">
                {ticketText(t, "tickets.forward.toAgent", { name: item.toUserName })}
              </div>
            ) : null}
            {item.reason.length > 0 ? (
              <p className="whitespace-pre-wrap rounded-md bg-elevated/50 px-2 py-1.5 text-foreground/85">
                {item.reason}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-1 text-[11px] text-muted-foreground">
              <span>{item.actorName ?? t("tickets.activity.system")}</span>
              <span aria-hidden="true">·</span>
              <RelativeTime value={item.createdAt} locale={i18n.language} />
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
