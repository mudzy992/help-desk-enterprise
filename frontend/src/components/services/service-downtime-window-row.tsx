import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RelativeTime } from "@/components/ui/relative-time";
import { browserTimeZone, formatInstantInZone } from "@/lib/services/downtime-datetime";
import type { DowntimeWindowResponse } from "@/services/service-downtime-api";

interface ServiceDowntimeWindowRowProperties {
  readonly window: DowntimeWindowResponse;
  readonly canCancel: boolean;
  readonly isCancelling: boolean;
  readonly onEdit: () => void;
  readonly onCancel: () => void;
}

export function ServiceDowntimeWindowRow({
  window,
  canCancel,
  isCancelling,
  onEdit,
  onCancel,
}: ServiceDowntimeWindowRowProperties) {
  const { t, i18n } = useTranslation();
  const timeZone = browserTimeZone();
  const absoluteRange = `${formatInstantInZone(window.startsAt, i18n.language, timeZone)} – ${formatInstantInZone(window.endsAt, i18n.language, timeZone)} (${timeZone})`;
  return (
    <li className="rounded-lg border border-border/70 bg-elevated/20 px-3 py-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge
          tone={window.phase === "ACTIVE" ? "warning" : "info"}
          className="text-[10px]"
          dot={false}
        >
          {t(`services.downtime.phase.${window.phase}`)}
        </Badge>
        <span className="text-[11px] text-muted-foreground" title={absoluteRange}>
          <RelativeTime value={window.startsAt} locale={i18n.language} />
          {" → "}
          <RelativeTime value={window.endsAt} locale={i18n.language} />
          {` · ${timeZone}`}
        </span>
      </div>
      <p className="mt-1 text-[12.5px] text-foreground">{window.message}</p>
      <div className="mt-2 flex flex-wrap justify-end gap-1.5">
        <Button type="button" size="xs" variant="outline" onClick={onEdit}>
          {t("services.downtime.edit")}
        </Button>
        <Button
          type="button"
          size="xs"
          variant="danger"
          disabled={!canCancel || isCancelling}
          onClick={onCancel}
        >
          {isCancelling ? t("services.downtime.cancelling") : t("services.downtime.cancelWindow")}
        </Button>
      </div>
    </li>
  );
}
