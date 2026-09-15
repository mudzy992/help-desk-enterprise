import { Boxes } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AddonCatalogRow } from "@/components/settings/addon-catalog-row";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { hintClassName } from "@/components/ui/control";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { useAddonCatalog } from "@/lib/settings/use-addon-catalog";
import { cn } from "@/lib/utils";

export function AddonsSettingsPanel() {
  const { t } = useTranslation();
  const catalog = useAddonCatalog();

  if (catalog.isLoading) {
    return (
      <PanelSkeleton className="mt-0" label={t("settings.addons.loading")} />
    );
  }
  if (catalog.items.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader
        title={t("settings.addons.title")}
        subtitle={t("settings.addons.subtitle")}
        actions={
          <Badge tone="neutral" dot={false}>
            <Boxes size={10.5} /> {t("settings.addons.registryBadge")}
          </Badge>
        }
      />
      <p className={cn(hintClassName, "px-4 pt-3")}>
        {t("settings.addons.readOnlyHint")}
      </p>
      <ul className="divide-y divide-border/50">
        {catalog.items.map((item) => (
          <AddonCatalogRow key={item.key} item={item} />
        ))}
      </ul>
    </Card>
  );
}
