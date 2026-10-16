import { Check, ListChecks, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetTrigger } from "@/components/ui/sheet";
import { InstallProfilePackageSheet } from "@/components/install/install-profile-package-sheet";
import { readInstallProfileItemPresentation } from "@/lib/install/install-profile-items";
import type { InstallProfilePackage } from "@/services/install-profile-api";

/*
  Install wizard v2 (F3): one package as a card — icon, name, honest time
  estimate, the first few catalogue lines and „Prikaži sve“ for the whole list.
  The details sheet shows the cumulative package contents (D1).
*/

export function InstallProfileCard({
  pack,
  packages,
  isSelected,
  onSelect,
}: {
  readonly pack: InstallProfilePackage;
  readonly packages: readonly InstallProfilePackage[];
  readonly isSelected: boolean;
  readonly onSelect: () => void;
}) {
  const { t } = useTranslation();
  const Icon: LucideIcon = isSelected ? Check : ListChecks;
  const previewItems = pack.items.slice(0, 5);

  return (
    <div
      className={cn(
        "flex flex-col rounded-lg border bg-surface p-4 shadow-card transition-colors duration-150",
        isSelected
          ? "border-primary ring-1 ring-primary/25"
          : "border-border hover:border-line-strong",
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-md",
            isSelected ? "bg-primary text-primary-foreground" : "bg-primary/10 text-link",
          )}
          aria-hidden="true"
        >
          <Icon size={15} strokeWidth={2.2} />
        </span>
        <p className="min-w-0 flex-1 truncate text-[13.5px] font-semibold tracking-[-0.01em] text-foreground">
          {t(pack.titleKey as never)}
        </p>
        {pack.recommended ? (
          <span className="pop-in shrink-0 rounded-md border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10.5px] font-semibold text-link">
            {t("install.profile.recommended")}
          </span>
        ) : null}
      </div>

      <p className="mt-2 text-[12px] leading-5 text-muted-foreground">
        {t(pack.descriptionKey as never)}
      </p>
      <p className="mt-2 text-[11.5px] font-medium text-muted-foreground">
        {t("install.profile.estimate", { minutes: pack.estimatedMinutes })}
      </p>

      <ul className="mt-3 grid flex-1 gap-1.5">
        {previewItems.map((item) => {
          const ItemIcon = readInstallProfileItemPresentation(item.key).icon;
          return (
            <li
              key={item.key}
              className="flex items-start gap-2 text-[12px] leading-5 text-foreground/85"
            >
              <ItemIcon
                size={13}
                strokeWidth={2.1}
                className="mt-1 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="min-w-0">{t(item.labelKey as never)}</span>
            </li>
          );
        })}
      </ul>

      <div className="mt-3.5 flex items-center gap-2">
        <Button
          type="button"
          variant={isSelected ? "default" : "secondary"}
          size="sm"
          aria-pressed={isSelected}
          onClick={onSelect}
        >
          {isSelected ? t("install.profile.selected") : t("install.profile.select")}
        </Button>
        <Sheet>
          <SheetTrigger asChild>
            <Button type="button" variant="ghost" size="sm">
              {t("install.profile.showAll")}
            </Button>
          </SheetTrigger>
          <InstallProfilePackageSheet pack={pack} packages={packages} />
        </Sheet>
      </div>
    </div>
  );
}
