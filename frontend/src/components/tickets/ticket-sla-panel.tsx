import { Hourglass, Pause, Timer } from "lucide-react";
import type { ReactNode } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Badge, MetaBadge, type BadgeTone } from "@/components/ui/badge";
import { DetailSection } from "@/components/tickets/detail-section";
import { Progress } from "@/components/ui/progress";
import {
  formatSlaRemainingTime,
  mapTicketSlaPanel,
  SLA_RISK_PERCENT,
  type TicketSlaStateKind,
  type TicketSlaTimerView,
} from "@/lib/tickets/map-ticket-sla-panel";
import { formatTicketTimestamp } from "@/lib/tickets/ticket-display";
import { cn } from "@/lib/utils";
import type { TicketResponse } from "@/services/tickets-api";
import type { TicketSlaContextResponse } from "@/services/tickets-context-api";

const STATE_TONE: Record<TicketSlaStateKind, BadgeTone> = {
  OK: "success",
  RISK: "warning",
  BREACHED: "danger",
};

interface TicketSlaPanelProperties {
  readonly ticket: TicketResponse;
  readonly context: TicketSlaContextResponse | null;
  readonly canConfigure: boolean;
}

function slaSubtitle(
  context: TicketSlaContextResponse | null,
  translate: TFunction<"common">,
): string | undefined {
  if (context === null || context.profileName === null) {
    return undefined;
  }
  return context.calendarName === null
    ? translate("tickets.detail.sla.profileOnly", {
        profile: context.profileName,
      })
    : translate("tickets.detail.sla.profileAndCalendar", {
        profile: context.profileName,
        calendar: context.calendarName,
      });
}

export function TicketSlaPanel({ ticket, context, canConfigure }: TicketSlaPanelProperties) {
  const { t, i18n } = useTranslation();
  const view = mapTicketSlaPanel(ticket.sla, new Date());
  if (view === null) {
    if (context === null || context.unavailableReason === null) {
      return null;
    }
    return (
      <DetailSection id="sla" title={t("tickets.detail.sla.title")}>
        <div className="space-y-1.5 text-[12px] leading-5">
          <p className="flex items-center gap-1.5 font-medium text-foreground/90">
            <Hourglass size={12} aria-hidden="true" /> {t("tickets.detail.sla.unavailableTitle")}
          </p>
          <p className="text-muted-foreground">
            {t(`tickets.detail.sla.unavailable.${context.unavailableReason}`)}
          </p>
          {canConfigure ? (
            <p className="text-[11px] text-muted-foreground">
              {t("tickets.detail.sla.unavailableAdminHint")}
            </p>
          ) : null}
        </div>
      </DetailSection>
    );
  }
  return (
    <DetailSection
      id="sla"
      title={t("tickets.detail.sla.title")}
      subtitle={slaSubtitle(context, t)}
    >
      <div className="space-y-4">
        <SlaTimerBlock
          icon={<Hourglass size={12} />}
          label={t("tickets.detail.sla.firstResponse")}
          remaining={remainingText(view.response, t)}
          timer={view.response}
        />
        <SlaTimerBlock
          icon={<Timer size={12} />}
          label={t("tickets.detail.sla.resolution")}
          remaining={remainingText(view.resolution, t)}
          timer={view.resolution}
          pauseLabel={view.resolution.paused ? t("tickets.detail.sla.pause") : null}
          hint={t("tickets.detail.sla.usedFrame", {
            percent: Math.round(view.resolution.usedPercent),
            risk: SLA_RISK_PERCENT,
          })}
        />
        <div className="flex items-center justify-between border-t border-border/70 pt-3">
          <MetaBadge
            meta={{
              label: t(`tickets.detail.sla.state.${view.state}`),
              tone: STATE_TONE[view.state],
            }}
          />
          {view.dueAt === null ? null : (
            <span className="text-[10.5px] text-muted-foreground">
              {t("tickets.detail.sla.due")}{" "}
              <span className="tnum">{formatTicketTimestamp(view.dueAt, i18n.language)}</span>
            </span>
          )}
        </div>
      </div>
    </DetailSection>
  );
}

function SlaTimerBlock({
  icon,
  label,
  remaining,
  timer,
  pauseLabel = null,
  hint,
}: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly remaining: string;
  readonly timer: TicketSlaTimerView;
  readonly pauseLabel?: string | null;
  readonly hint?: string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-[12px]">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          {icon} {label}
          {pauseLabel === null ? null : (
            <Badge tone="warning" className="px-1">
              <Pause size={9} /> {pauseLabel}
            </Badge>
          )}
        </span>
        <span className={cn("tnum font-medium", remainingToneClass(timer))}>{remaining}</span>
      </div>
      <Progress value={timer.usedPercent} tone={timer.tone} />
      {hint === undefined ? null : (
        <p className="mt-1 text-[10.5px] text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

function remainingText(timer: TicketSlaTimerView, translate: TFunction<"common">): string {
  if (timer.satisfied) {
    return translate("tickets.detail.sla.satisfied");
  }
  const part = formatSlaRemainingTime(timer.remainingMs);
  const time = translate(`tickets.detail.sla.${part.unit}`, {
    count: part.count,
  });
  return translate(timer.overdue ? "tickets.detail.sla.overdue" : "tickets.detail.sla.remaining", {
    time,
  });
}

function remainingToneClass(timer: TicketSlaTimerView): string {
  if (timer.satisfied) {
    return "text-ok";
  }
  if (timer.overdue) {
    return "text-danger";
  }
  if (timer.tone === "warning") {
    return "text-warning";
  }
  return "text-foreground";
}
