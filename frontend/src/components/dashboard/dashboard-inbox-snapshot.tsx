import { ArrowRight, Clock, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { getTicketCounts } from "@/services/tickets-counts-api";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { HBars } from "@/components/charts/h-bars";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { groupInboxCounts } from "@/lib/dashboard/dashboard-ticket-sets";
import { groupNamesFromTickets } from "@/lib/tickets/ticket-names";
import { SEMANTIC_DOT_HEX } from "@/lib/theme/semantic-meta";
import type { TicketResponse } from "@/services/tickets-api";

interface DashboardInboxSnapshotProperties {
  readonly unroutedCount: number;
  readonly inboxTickets: readonly TicketResponse[] | null;
  readonly groupNames: ReadonlyMap<string, string>;
}

export function DashboardInboxSnapshot({
  unroutedCount,
  inboxTickets,
  groupNames,
}: DashboardInboxSnapshotProperties) {
  const { t } = useTranslation();
  // Paket 1.7 (U3): unrouted past the cleanup deadline (includes tickets sent
  // to the unrouted target group and still unassigned there).
  const [overdue, setOverdue] = useState<{ count: number; hours: number } | null>(null);
  useEffect(() => {
    let active = true;
    getTicketCounts()
      .then((counts) => {
        if (active && counts.unroutedOverdue !== undefined) {
          setOverdue({ count: counts.unroutedOverdue, hours: counts.unroutedCleanupHours ?? 0 });
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [unroutedCount]);
  const groups =
    inboxTickets === null
      ? []
      : groupInboxCounts(
          inboxTickets,
          new Map([...groupNamesFromTickets(inboxTickets), ...groupNames]),
        );
  const bars = groups.map((group) => ({
    label:
      group.label.length > 0
        ? group.label
        : t("dashboard.inboxGroupFallback"),
    value: group.count,
    color:
      group.groupId === null
        ? SEMANTIC_DOT_HEX.danger
        : SEMANTIC_DOT_HEX.primary,
    suffix: t("dashboard.inboxGroupCountSuffix"),
  }));

  return (
    <Card className="fade-in">
      <CardHeader
        title={t("dashboard.inboxSnapshotTitle")}
        subtitle={t("dashboard.inboxSnapshotSubtitle")}
        actions={
          <Button asChild size="xs" variant="ghost">
            <Link to="/tickets?view=inbox">
              {t("dashboard.inboxOpen")} <ArrowRight size={12} />
            </Link>
          </Button>
        }
      />
      <div className="px-4 py-4">
        {unroutedCount > 0 ? (
          <Link
            to="/tickets?view=all&status=UNROUTED"
            className="mb-3.5 flex w-full items-center gap-2.5 rounded-lg border border-danger/35 bg-danger/8 px-3 py-2.5 text-left transition-colors hover:bg-danger/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/70"
          >
            <ShieldAlert size={15} className="shrink-0 text-danger" />
            <span className="flex-1 text-[12.5px] text-foreground">
              <span className="tnum font-semibold">{unroutedCount}</span>{" "}
              {t("dashboard.inboxUnroutedBanner")}
            </span>
          </Link>
        ) : null}
        {overdue !== null && overdue.count > 0 && overdue.hours > 0 ? (
          <Link
            to="/tickets?view=all&unroutedOverdue=true"
            className="mb-3.5 flex w-full items-center gap-2.5 rounded-lg border border-danger/50 bg-danger/12 px-3 py-2.5 text-left transition-colors hover:bg-danger/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/70"
          >
            <Clock size={15} className="shrink-0 text-danger" />
            <span className="flex-1 text-[12.5px] font-medium text-danger">
              {t("dashboard.unroutedOverdueBanner", { count: overdue.count, hours: overdue.hours })}
            </span>
          </Link>
        ) : null}
        {bars.length > 0 ? (
          <HBars items={bars} />
        ) : unroutedCount === 0 ? (
          <EmptyState
            title={t("dashboard.inboxEmpty")}
            action={
              <Button asChild size="sm" variant="outline">
                <Link to="/tickets?view=inbox">{t("dashboard.inboxOpen")}</Link>
              </Button>
            }
          />
        ) : null}
      </div>
    </Card>
  );
}
