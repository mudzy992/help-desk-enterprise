import { Check, Clock3, GitBranch, ShieldAlert, Timer } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  buildActivityTimeline,
  type TicketActivityItem,
} from "@/lib/tickets/describe-ticket-activity";
import { formatTicketTimestamp } from "@/lib/tickets/ticket-display";
import type { TicketActivityKind } from "@/lib/tickets/ticket-system-events";
import { cn } from "@/lib/utils";
import type { TicketMessageResponse } from "@/services/tickets-collaboration-api";
import type {
  TicketHistoryEntry,
  TicketPublicActivityEntry,
} from "@/services/tickets-context-api";

const kindChipClass: Readonly<Record<TicketActivityKind, string>> = {
  sla: "border-warning/30 bg-warning/10 text-warning",
  routing: "border-info/30 bg-info/10 text-info",
  status: "border-primary/30 bg-primary/10 text-[#7FA8F5]",
  assign: "border-primary/30 bg-primary/10 text-[#7FA8F5]",
  approval: "border-success/30 bg-success/10 text-[#4ADE80]",
  security: "border-danger/30 bg-danger/10 text-danger",
  edit: "border-border bg-elevated text-muted-foreground",
};

function ActivityIcon({ kind }: { readonly kind: TicketActivityKind }) {
  const size = 12;
  switch (kind) {
    case "sla":
      return <Timer size={size} aria-hidden="true" />;
    case "routing":
      return <GitBranch size={size} aria-hidden="true" />;
    case "approval":
      return <Check size={size} aria-hidden="true" />;
    case "security":
      return <ShieldAlert size={size} aria-hidden="true" />;
    default:
      return <Clock3 size={size} aria-hidden="true" />;
  }
}

interface TicketActivityListProperties {
  readonly messages: readonly TicketMessageResponse[];
  readonly history: readonly TicketHistoryEntry[];
  readonly publicEntries: readonly TicketPublicActivityEntry[];
  readonly isStaff: boolean;
  readonly authorNames: ReadonlyMap<string, string>;
}

export function TicketActivityList({
  messages,
  history,
  publicEntries,
  isStaff,
  authorNames,
}: TicketActivityListProperties) {
  const { t, i18n } = useTranslation();
  const items = useMemo(
    () =>
      buildActivityTimeline({
        messages: isStaff ? messages : [],
        history: isStaff ? history : [],
        publicEntries: isStaff ? [] : publicEntries,
        authorNames,
        t,
      }),
    [messages, history, publicEntries, isStaff, authorNames, t],
  );
  return (
    <Card>
      <CardHeader
        title={t("tickets.activity.title")}
        subtitle={t(isStaff ? "tickets.activity.subtitle" : "tickets.activity.subtitlePublic")}
      />
      {items.length === 0 ? (
        <div className="px-4 py-3">
          <EmptyState
            title={t("tickets.activity.emptyTitle")}
            body={t("tickets.activity.emptyBody")}
          />
        </div>
      ) : (
        <ul className="divide-y divide-border/50">
          {items.map((item) => (
            <ActivityRow key={item.id} item={item} locale={i18n.language} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function ActivityRow({
  item,
  locale,
}: {
  readonly item: TicketActivityItem;
  readonly locale: string;
}) {
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <span
        className={cn(
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border",
          kindChipClass[item.kind],
        )}
      >
        <ActivityIcon kind={item.kind} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] leading-5 text-foreground/90">
          <span className="font-medium text-foreground">{item.actor}</span>{" "}
          <span className="text-muted-foreground">·</span> {item.text}
        </p>
        {item.note !== null ? (
          <p className="mt-0.5 text-[12px] italic leading-5 text-muted-foreground">
            {item.note}
          </p>
        ) : null}
        <p className="text-[11px] text-muted-foreground/70 tnum">
          {formatTicketTimestamp(item.at, locale)}
        </p>
      </div>
    </li>
  );
}
