import { Boxes } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Switch } from "@/components/ui/switch";
import { resolveInstallAddonCopy } from "@/lib/install-addon-copy";
import { cn } from "@/lib/utils";
import type { InstallAddonItem } from "@/services/install-addons-api";

export function AddonCatalogRow({
  item,
}: {
  readonly item: InstallAddonItem;
}) {
  const { t } = useTranslation();
  const copy = resolveInstallAddonCopy(item.key);
  const label = copy === null ? item.key : t(copy.label);
  const description = copy === null ? "" : t(copy.description);

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-md border",
          item.enabled
            ? "border-primary/35 bg-primary/10 text-[#7FA8F5]"
            : "border-border bg-background/50 text-muted-foreground/60",
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
      <span className="hidden font-mono text-[10px] text-muted-foreground/50 md:block tnum">
        {item.key}
      </span>
      <Switch
        checked={item.enabled}
        disabled
        onCheckedChange={() => undefined}
        aria-label={label}
      />
    </li>
  );
}
