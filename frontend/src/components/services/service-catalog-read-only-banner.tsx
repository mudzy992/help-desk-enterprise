import { Lock } from "lucide-react";
import { useTranslation } from "react-i18next";

type ServiceCatalogReadOnlyBannerProps = {
  readonly visible: boolean;
};

export function ServiceCatalogReadOnlyBanner({
  visible,
}: ServiceCatalogReadOnlyBannerProps) {
  const { t } = useTranslation();
  if (!visible) {
    return null;
  }
  return (
    <div
      role="status"
      className="mb-4 flex items-start gap-2.5 rounded-lg border border-border/80 bg-muted/40 px-3.5 py-3 text-[12.5px] text-muted-foreground"
    >
      <Lock size={14} className="mt-0.5 shrink-0 text-foreground/70" aria-hidden />
      <p>{t("services.readOnlyBanner")}</p>
    </div>
  );
}
