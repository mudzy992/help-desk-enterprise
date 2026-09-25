import { RefreshCw, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { AdminConfigUpdatedEvent } from "@/lib/realtime/admin-config-events";

/** Paket 1.7 (R3): shown instead of reloading while the admin is editing. */
export function AdminConfigChangedBanner({
  pending,
  onRefresh,
  onDismiss,
}: {
  readonly pending: AdminConfigUpdatedEvent | null;
  readonly onRefresh: () => void;
  readonly onDismiss: () => void;
}) {
  const { t } = useTranslation();
  if (pending === null) {
    return null;
  }
  const domain = t(`adminRealtime.domains.${pending.domain}`);
  return (
    <div
      role="status"
      className="mb-3 flex items-center gap-2.5 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-[12.5px] text-foreground"
    >
      <RefreshCw size={14} className="shrink-0 text-warning" />
      <span className="flex-1">
        {pending.actorName
          ? t("adminRealtime.changedBy", { domain, name: pending.actorName })
          : t("adminRealtime.changed", { domain })}
      </span>
      <Button type="button" size="xs" variant="outline" onClick={onRefresh}>
        {t("adminRealtime.refresh")}
      </Button>
      <Button type="button" size="xs" variant="ghost" onClick={onDismiss} aria-label={t("adminRealtime.dismiss")}>
        <X size={12} />
      </Button>
    </div>
  );
}
