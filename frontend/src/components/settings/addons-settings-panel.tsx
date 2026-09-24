import { Boxes } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AddonCatalogRow } from "@/components/settings/addon-catalog-row";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { useAddonCatalog } from "@/lib/settings/use-addon-catalog";
import type { SettingsSaveInput } from "@/lib/settings/use-settings-registry";
import { addonRegistryKey } from "@/lib/settings/is-featured-setting-key";

interface AddonsSettingsPanelProperties {
  readonly canWrite: boolean;
  readonly pendingKey: string | null;
  readonly onSave: (input: SettingsSaveInput) => Promise<void>;
}

export function AddonsSettingsPanel({
  canWrite,
  pendingKey,
  onSave,
}: AddonsSettingsPanelProperties) {
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
    <Card className="fade-in">
      <CardHeader
        title={t("settings.addons.title")}
        subtitle={t("settings.addons.subtitle")}
        actions={
          <Badge tone="neutral" dot={false}>
            <Boxes size={10.5} /> {t("settings.addons.registryBadge")}
          </Badge>
        }
      />
      <ul className="divide-y divide-border/50">
        {catalog.items.map((item) => (
          <AddonCatalogRow
            key={item.key}
            item={item}
            canWrite={canWrite}
            pending={pendingKey === addonRegistryKey(item.key)}
            onSave={onSave}
          />
        ))}
      </ul>
    </Card>
  );
}
