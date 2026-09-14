import { ArrowRight, ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { groupInboxCounts } from "@/lib/dashboard/dashboard-ticket-sets";
import type { TicketResponse } from "@/services/tickets-api";

interface DashboardInboxSnapshotProperties {
  readonly unroutedCount: number;
  readonly inboxTickets: readonly TicketResponse[] | null;
}

export function DashboardInboxSnapshot({
  unroutedCount,
  inboxTickets,
}: DashboardInboxSnapshotProperties) {
  const { t } = useTranslation();
  const groups =
    inboxTickets === null ? [] : groupInboxCounts(inboxTickets);
  const hasGroups = groups.length > 0;

  return (
    <Card>
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
            className="mb-3.5 flex w-full items-center gap-2.5 rounded-md border border-danger/35 bg-danger/8 px-3 py-2.5 text-left transition-colors hover:bg-danger/12"
          >
            <ShieldAlert size={15} className="shrink-0 text-danger" />
            <span className="flex-1 text-[12.5px] text-foreground">
              <span className="tnum font-semibold">{unroutedCount}</span>{" "}
              {t("dashboard.inboxUnroutedBanner")}
            </span>
          </Link>
        ) : null}
        {hasGroups ? (
          <ul className="divide-y divide-border/50 rounded-md border border-border/60">
            {groups.map((group) => (
              <li
                key={group.groupId ?? "ungrouped"}
                className="flex items-baseline justify-between gap-3 px-3 py-2 text-[12px]"
              >
                <span className="truncate text-muted-foreground">
                  {group.label.length > 0
                    ? group.label
                    : t("dashboard.inboxGroupFallback")}
                </span>
                <span className="tnum shrink-0 font-medium text-foreground">
                  {group.count}
                  <span className="ml-0.5 text-[11px] font-normal text-muted-foreground/70">
                    {t("dashboard.inboxGroupCountSuffix")}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : unroutedCount === 0 ? (
          <p className="text-center text-[12px] text-muted-foreground">
            {t("dashboard.inboxEmpty")}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
