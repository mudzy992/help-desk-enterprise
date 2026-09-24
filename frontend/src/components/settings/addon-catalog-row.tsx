import { Boxes } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SettingsReasonConfirm } from "@/components/settings/settings-reason-confirm";
import { Switch } from "@/components/ui/switch";
import { resolveInstallAddonCopy } from "@/lib/install-addon-copy";
import { addonRegistryKey } from "@/lib/settings/is-featured-setting-key";
import type { SettingsSaveInput } from "@/lib/settings/use-settings-registry";
import { cn } from "@/lib/utils";
import type { InstallAddonItem } from "@/services/install-addons-api";

interface AddonCatalogRowProperties {
  readonly item: InstallAddonItem;
  readonly canWrite: boolean;
  readonly pending: boolean;
  readonly onSave: (input: SettingsSaveInput) => Promise<void>;
}

export function AddonCatalogRow({
  item,
  canWrite,
  pending,
  onSave,
}: AddonCatalogRowProperties) {
  const { t } = useTranslation();
  const copy = resolveInstallAddonCopy(item.key);
  const label = copy === null ? item.key : t(copy.label);
  const description = copy === null ? "" : t(copy.description);
  const [draftEnabled, setDraftEnabled] = useState<boolean | null>(null);
  const effectiveEnabled = draftEnabled ?? item.enabled;
  const canToggle = canWrite && item.canEnable;

  return (
    <li className="px-4 py-3">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg border",
            effectiveEnabled
              ? "border-primary/35 bg-primary/10 text-link"
              : "border-border bg-elevated/50 text-muted-foreground/60",
          )}
        >
          <Boxes size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-medium text-foreground">{label}</p>
          {description ? (
            <p className="text-[11px] text-muted-foreground">{description}</p>
          ) : null}
        </div>
        <span className="tnum hidden font-mono text-[10px] text-muted-foreground/50 md:block">
          {item.key}
        </span>
        <Switch
          checked={effectiveEnabled}
          disabled={!canToggle || pending}
          onCheckedChange={(checked) => setDraftEnabled(checked)}
          aria-label={label}
        />
      </div>
      {draftEnabled !== null && draftEnabled !== item.enabled ? (
        <SettingsReasonConfirm
          pending={pending}
          onCancel={() => setDraftEnabled(null)}
          onConfirm={async (reason) => {
            await onSave({
              key: addonRegistryKey(item.key),
              value: draftEnabled,
              reason,
            });
            setDraftEnabled(null);
          }}
        />
      ) : null}
    </li>
  );
}
