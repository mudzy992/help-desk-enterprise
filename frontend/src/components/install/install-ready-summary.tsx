import { Blocks, Wrench } from "lucide-react";
import { useTranslation } from "react-i18next";
import { hintClassName } from "@/components/ui/control";
import { resolveInstallAddonPresentation } from "@/lib/install/install-addon-presentation";
import { isKnownInstallStepKey, installStepLabelKey } from "@/lib/install/install-wizard-order";
import type { InstallProfile } from "@/services/install-profile-api";
import type { InstallSetupSummary } from "@/services/install-api";

/*
  Install wizard v2 (F6.2): what „Sistem je spreman“ reports. The values come from
  the status payload the page already holds (`summary`), so nothing here is
  fetched or guessed — and a missing summary (an older backend) renders nothing
  instead of empty numbers.
*/

type SummaryLabelKey =
  | "install.ready.profile"
  | "install.ready.organization"
  | "install.ready.units"
  | "install.ready.services"
  | "install.ready.groups"
  | "install.ready.team";

const packageTitleKeys = {
  minimum: "install.profile.minimum.title",
  standard: "install.profile.standard.title",
  full: "install.profile.full.title",
} as const satisfies Readonly<Record<InstallProfile, string>>;

type SummaryRow = {
  readonly key: string;
  readonly labelKey: SummaryLabelKey;
  readonly value: string;
};

export function InstallReadySummary({ summary }: { readonly summary: InstallSetupSummary | null }) {
  const { t } = useTranslation();
  if (summary === null) {
    return null;
  }
  const rows: readonly SummaryRow[] = [
    ...(summary.profile === null
      ? []
      : [
          {
            key: "profile",
            labelKey: "install.ready.profile",
            value: t(packageTitleKeys[summary.profile]),
          } satisfies SummaryRow,
        ]),
    {
      key: "organization",
      labelKey: "install.ready.organization",
      value:
        summary.organizationName.length > 0
          ? summary.organizationName
          : t("install.shell.organizationFallback"),
    },
    {
      key: "units",
      labelKey: "install.ready.units",
      value: String(summary.organizationalUnitCount),
    },
    { key: "services", labelKey: "install.ready.services", value: String(summary.serviceCount) },
    { key: "groups", labelKey: "install.ready.groups", value: String(summary.groupCount) },
    { key: "team", labelKey: "install.ready.team", value: String(summary.teamMemberCount) },
  ];

  return (
    <div className="grid gap-4">
      <dl className="grid gap-2 sm:grid-cols-2">
        {rows.map((row) => (
          <div
            key={row.key}
            className="flex items-baseline justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2.5"
          >
            <dt className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
              {t(row.labelKey)}
            </dt>
            <dd className="min-w-0 truncate text-[13px] font-semibold text-foreground">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>

      {summary.enabledAddonKeys.length > 0 ? (
        <div className="grid gap-1.5">
          <p className={hintClassName}>
            <Blocks aria-hidden="true" size={13} className="mr-1 inline align-[-2px]" />
            {t("install.ready.addons")}
          </p>
          <ul className="flex flex-wrap gap-x-3.5 gap-y-1.5">
            {summary.enabledAddonKeys.map((key) => {
              const presentation = resolveInstallAddonPresentation(key);
              if (presentation === null) return null;
              const Icon = presentation.icon;
              return (
                <li key={key} className="flex items-center gap-1.5 text-[12.5px] leading-5">
                  <Icon aria-hidden="true" size={13} className="text-muted-foreground" />
                  <span className="text-foreground">{t(presentation.titleKey)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {summary.deferredSteps.length > 0 ? (
        <div className="grid gap-1.5">
          <p className={hintClassName}>
            <Wrench aria-hidden="true" size={13} className="mr-1 inline align-[-2px]" />
            {t("install.ready.later")}
          </p>
          <ul className="flex flex-wrap gap-x-3.5 gap-y-1.5">
            {summary.deferredSteps.map((step) =>
              isKnownInstallStepKey(step) ? (
                <li key={step} className="text-[12.5px] leading-5 text-muted-foreground">
                  {t(installStepLabelKey(step))}
                </li>
              ) : null,
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
