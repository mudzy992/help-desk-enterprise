import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  shouldShowGlobalMaintenanceBanner,
  type PublicMaintenanceState,
} from "@/lib/maintenance/parse-public-maintenance";

interface MaintenanceBannerProperties {
  readonly maintenance: PublicMaintenanceState;
}

export function MaintenanceBanner({
  maintenance,
}: MaintenanceBannerProperties) {
  const { t } = useTranslation();
  if (!shouldShowGlobalMaintenanceBanner(maintenance)) {
    return null;
  }
  const message =
    maintenance.message.trim().length > 0
      ? maintenance.message
      : t("maintenance.defaultMessage");
  const period =
    maintenance.fromAt.length > 0 || maintenance.toAt.length > 0
      ? t("maintenance.period", {
          from: maintenance.fromAt || "—",
          to: maintenance.toAt || "—",
        })
      : null;
  return (
    <div
      role="status"
      className="fade-in mb-4 flex items-start gap-2.5 rounded-lg border border-warning/40 bg-warning/10 px-3.5 py-3 text-[12.5px] text-foreground"
    >
      <AlertTriangle
        size={16}
        className="mt-0.5 shrink-0 text-warning"
        aria-hidden
      />
      <div className="min-w-0">
        <p className="font-medium">{t("maintenance.title")}</p>
        <p className="mt-0.5 text-muted-foreground">{message}</p>
        {period ? (
          <p className="tnum mt-1 text-[11.5px] text-muted-foreground/90">
            {period}
          </p>
        ) : null}
        <p className="mt-1 text-[11px] text-muted-foreground/80">
          {t("maintenance.nonBlockingHint")}
        </p>
      </div>
    </div>
  );
}
