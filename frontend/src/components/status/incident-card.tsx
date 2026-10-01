import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Bell, BellOff, CheckCircle2, ChevronDown, ChevronUp, Link2, Megaphone, Pencil } from "lucide-react";
import { IncidentProblemLinks } from "@/components/problems/problem-reference-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { hintClassName } from "@/components/ui/control";
import { RelativeTime } from "@/components/ui/relative-time";
import { formatTicketTimestamp } from "@/lib/tickets/ticket-display";
import {
  availabilityTone,
  incidentDurationMinutes,
  incidentStatusTone,
  localizedIncidentTitle,
  splitDuration,
} from "@/lib/status/status-view";
import type { Incident } from "@/services/status-api";

interface IncidentCardProperties {
  readonly incident: Incident;
  readonly canManage: boolean;
  readonly nowMs: number;
  readonly busy?: boolean;
  readonly onSubscribe?: (incident: Incident) => void;
  readonly onUpdate?: (incident: Incident) => void;
  readonly onResolve?: (incident: Incident) => void;
  readonly onEdit?: (incident: Incident) => void;
  /** Collapsed history entries start with the timeline hidden. */
  readonly defaultExpanded?: boolean;
}

const visibleUpdates = 3;

export function useDurationLabel() {
  const { t } = useTranslation();
  return (minutes: number) => {
    const parts = splitDuration(minutes);
    if (parts.days > 0) return t("status.duration.days", { days: parts.days, hours: parts.hours });
    if (parts.hours > 0) return t("status.duration.hours", { hours: parts.hours, minutes: parts.minutes });
    return t("status.duration.minutes", { minutes: parts.minutes });
  };
}

/** Paket 2.7 (§8.1): one incident with its timeline (newest first). */
export function IncidentCard({
  incident,
  canManage,
  nowMs,
  busy = false,
  onSubscribe,
  onUpdate,
  onResolve,
  onEdit,
  defaultExpanded = true,
}: IncidentCardProperties) {
  const { t, i18n } = useTranslation();
  const durationLabel = useDurationLabel();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [showAll, setShowAll] = useState(false);
  const resolved = incident.status === "RESOLVED";
  const updates = showAll ? incident.updates : incident.updates.slice(0, visibleUpdates);

  return (
    <Card className="fade-in" data-testid="status-incident">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pb-3 pt-3.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={availabilityTone(incident.impact)} dot>
              {t(`status.impact.${incident.impact}`)}
            </Badge>
            <Badge tone={incidentStatusTone(incident.status)}>{t(`status.status.${incident.status}`)}</Badge>
            {incident.visibility === "STAFF_ONLY" ? <Badge tone="hold">{t("status.visibility.STAFF_ONLY")}</Badge> : null}
          </div>
          <h3 className="mt-1.5 text-[14px] font-semibold leading-5 text-foreground">
            {localizedIncidentTitle(incident, i18n.language)}
          </h3>
          <p className={`mt-0.5 ${hintClassName}`}>
            {incident.services.map((service) => service.name).join(", ")}
          </p>
          <p className={`mt-1 ${hintClassName}`}>
            <span title={formatTicketTimestamp(incident.startedAt, i18n.language)}>
              {t("status.card.started")} <RelativeTime value={incident.startedAt} locale={i18n.language} />
            </span>
            {" · "}
            {resolved
              ? t("status.card.lasted", { duration: durationLabel(incidentDurationMinutes(incident, nowMs)) })
              : t("status.card.ongoing", { duration: durationLabel(incidentDurationMinutes(incident, nowMs)) })}
            {incident.linkedTicketCount !== null && incident.linkedTicketCount > 0 ? (
              <>
                {" · "}
                <span className="inline-flex items-center gap-1">
                  <Link2 size={11} aria-hidden="true" />
                  {t("status.card.linkedTickets", { count: incident.linkedTicketCount })}
                </span>
              </>
            ) : null}
            {incident.subscriberCount !== null && incident.subscriberCount > 0 ? (
              <>
                {" · "}
                {t("status.card.subscribers", { count: incident.subscriberCount })}
              </>
            ) : null}
          </p>
          {canManage ? <IncidentProblemLinks incidentId={incident.id} /> : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {!resolved && onSubscribe ? (
            <Button size="xs" variant={incident.subscribed ? "secondary" : "outline"} disabled={busy} onClick={() => onSubscribe(incident)}>
              {incident.subscribed ? <BellOff /> : <Bell />}
              {incident.subscribed ? t("status.card.unsubscribe") : t("status.card.subscribe")}
            </Button>
          ) : null}
          {canManage && !resolved ? (
            <>
              {onEdit ? (
                <Button size="xs" variant="ghost" disabled={busy} onClick={() => onEdit(incident)} aria-label={t("status.card.edit")}>
                  <Pencil />
                  {t("status.card.edit")}
                </Button>
              ) : null}
              {onUpdate ? (
                <Button size="xs" variant="outline" disabled={busy} onClick={() => onUpdate(incident)}>
                  <Megaphone />
                  {t("status.card.postUpdate")}
                </Button>
              ) : null}
              {onResolve ? (
                <Button size="xs" disabled={busy} onClick={() => onResolve(incident)}>
                  <CheckCircle2 />
                  {t("status.card.resolve")}
                </Button>
              ) : null}
            </>
          ) : null}
          {!defaultExpanded ? (
            <Button
              size="xs"
              variant="ghost"
              onClick={() => setExpanded((value) => !value)}
              aria-expanded={expanded}
              aria-label={expanded ? t("status.card.collapse") : t("status.card.expand")}
            >
              {expanded ? <ChevronUp /> : <ChevronDown />}
            </Button>
          ) : null}
        </div>
      </div>
      {expanded ? (
        <ol className="grid gap-3 border-t border-border/70 px-4 py-3.5">
          {updates.map((update) => (
            <li key={update.id} className="grid grid-cols-[auto_1fr] gap-x-3 text-[12.5px]">
              <span className="mt-1.5 size-2 rounded-full bg-border" aria-hidden="true" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium text-foreground">{t(`status.status.${update.status}`)}</span>
                  <span className={hintClassName}>
                    {formatTicketTimestamp(update.createdAt, i18n.language)}
                    {update.authorName ? ` · ${update.authorName}` : ""}
                  </span>
                </div>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-foreground/85">{update.message}</p>
              </div>
            </li>
          ))}
          {incident.updates.length > visibleUpdates ? (
            <li>
              <Button size="xs" variant="link" onClick={() => setShowAll((value) => !value)}>
                {showAll ? t("status.card.showLess") : t("status.card.showAll", { count: incident.updates.length })}
              </Button>
            </li>
          ) : null}
        </ol>
      ) : null}
    </Card>
  );
}
