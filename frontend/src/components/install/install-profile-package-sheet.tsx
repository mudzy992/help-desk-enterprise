import { useTranslation } from "react-i18next";
import {
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { readInstallProfileItemPresentation } from "@/lib/install/install-profile-items";
import type {
  InstallProfile,
  InstallProfileItem,
  InstallProfilePackage,
} from "@/services/install-profile-api";

/*
  Package details drawer (F3 polish): packages are cumulative (D1). The sheet
  states that clearly, groups items by the package that introduced them, and
  uses the same padding rhythm as other admin drawers (`p-5` / `p-6`).
*/

const profileOrder: readonly InstallProfile[] = ["minimum", "standard", "full"];

export function InstallProfilePackageSheet({
  pack,
  packages,
}: {
  readonly pack: InstallProfilePackage;
  readonly packages: readonly InstallProfilePackage[];
}) {
  const { t } = useTranslation();
  const groups = groupItemsByIntroducingPackage(packages, pack.profile);
  const includesKey = packageIncludesMessageKey(pack.profile);

  return (
    <SheetContent
      side="right"
      className="flex w-full max-w-md flex-col overflow-y-auto p-6 sm:p-7"
    >
      <header className="pr-8">
        <SheetTitle className="text-[17px] font-semibold tracking-[-0.02em]">
          {t(pack.titleKey as never)}
        </SheetTitle>
        <SheetDescription className="mt-2 text-[13px] leading-5 text-muted-foreground">
          {t(pack.descriptionKey as never)}
        </SheetDescription>
      </header>

      {includesKey === null ? (
        <p className="mt-5 rounded-md border border-border bg-muted/40 px-3.5 py-3 text-[12.5px] leading-5 text-foreground/90">
          {t("install.profile.includesBase")}
        </p>
      ) : (
        <p className="mt-5 rounded-md border border-primary/25 bg-primary/10 px-3.5 py-3 text-[12.5px] leading-5 text-foreground">
          {t(includesKey)}
        </p>
      )}

      <div className="mt-6 grid gap-6">
        {groups.map((group) => (
          <section key={group.profile} aria-labelledby={`package-group-${group.profile}`}>
            <h3
              id={`package-group-${group.profile}`}
              className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground"
            >
              {group.profile === pack.profile
                ? t("install.profile.groupNewIn", {
                    package: t(`install.profile.${group.profile}.title` as never),
                  })
                : t("install.profile.groupFrom", {
                    package: t(`install.profile.${group.profile}.title` as never),
                  })}
            </h3>
            <ul className="mt-3 grid gap-3">
              {group.items.map((item) => (
                <PackageSheetItem key={item.key} item={item} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </SheetContent>
  );
}

function PackageSheetItem({ item }: { readonly item: InstallProfileItem }) {
  const { t } = useTranslation();
  const ItemIcon = readInstallProfileItemPresentation(item.key).icon;
  return (
    <li className="flex items-start gap-3 rounded-md border border-border/70 bg-surface px-3 py-2.5">
      <span
        className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
        aria-hidden="true"
      >
        <ItemIcon size={14} strokeWidth={2.1} />
      </span>
      <span className="min-w-0 flex-1 pt-0.5 text-[13px] leading-5 text-foreground">
        {t(item.labelKey as never)}
      </span>
      <span className="shrink-0 pt-0.5 text-[11px] font-medium text-muted-foreground">
        {item.required ? t("install.profile.itemRequired") : t("install.profile.itemOptional")}
      </span>
    </li>
  );
}

function packageIncludesMessageKey(
  profile: InstallProfile,
): "install.profile.includesMinimum" | "install.profile.includesMinimumAndStandard" | null {
  if (profile === "standard") return "install.profile.includesMinimum";
  if (profile === "full") return "install.profile.includesMinimumAndStandard";
  return null;
}

export function groupItemsByIntroducingPackage(
  packages: readonly InstallProfilePackage[],
  profile: InstallProfile,
): readonly { readonly profile: InstallProfile; readonly items: readonly InstallProfileItem[] }[] {
  const rank = profileOrder.indexOf(profile);
  const seen = new Set<string>();
  return profileOrder
    .filter((_, index) => index <= rank)
    .flatMap((entry) => {
      const pack = packages.find((candidate) => candidate.profile === entry);
      if (pack === undefined) return [];
      const items = pack.items.filter((item) => {
        if (seen.has(item.key)) return false;
        seen.add(item.key);
        return true;
      });
      return items.length === 0 ? [] : [{ profile: entry, items }];
    });
}
