import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ModalFooter } from "@/components/ui/modal";
import { ResponsiveSurface } from "@/components/ui/responsive-surface";
import { resolveRegistryTitle } from "@/lib/settings/resolve-registry-i18n";
import type { SettingDependentReset } from "@/services/settings-api";

interface SettingDependentsDialogProperties {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** The key being switched off, shown in the title. */
  readonly parentKey: string;
  readonly parentTitle: string;
  readonly dependents: readonly SettingDependentReset[];
  readonly isPending: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

/**
 * Paket 5.3.4 (D7): before a setting is switched off the administrator sees the
 * exact list of keys the server will change — and what will happen to each one.
 * The list comes from `GET /settings/dependents`, so it is not a guess: secrets
 * are deleted (the value must be entered again), a dependent whose default is
 * "on" is switched off, everything else returns to its default.
 */
export function SettingDependentsDialog({
  open,
  onOpenChange,
  parentKey,
  parentTitle,
  dependents,
  isPending,
  onCancel,
  onConfirm,
}: SettingDependentsDialogProperties) {
  const { t } = useTranslation();

  return (
    <ResponsiveSurface
      open={open}
      onOpenChange={onOpenChange}
      testId="setting-dependents-dialog"
      title={t("settings.dependencies.confirmTitle", { setting: parentTitle })}
      description={t("settings.dependencies.confirmBody", {
        count: dependents.length,
      })}
    >
      <p className="mb-2 font-mono text-[11px] text-muted-foreground">{parentKey}</p>
      <ul
        data-testid="setting-dependents-list"
        className="divide-y divide-border/60 rounded-lg border border-border/70"
      >
        {dependents.map((dependent) => (
          <li
            key={dependent.key}
            data-testid={`setting-dependent-${dependent.key}`}
            className="px-3 py-2"
          >
            <p className="text-[12.5px] text-foreground/90">
              {resolveRegistryTitle(t, {
                key: dependent.key,
                titleKey: `settings.registry.keys.${dependent.key}`,
                description: dependent.key,
              })}
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] text-muted-foreground">
                {dependent.key}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {dependent.action === "delete"
                  ? t("settings.dependencies.actionDelete")
                  : dependent.action === "disable"
                    ? t("settings.dependencies.actionDisable")
                    : t("settings.dependencies.actionDefault")}
              </span>
            </p>
          </li>
        ))}
      </ul>
      <ModalFooter>
        <Button
          type="button"
          variant="secondary"
          data-testid="setting-dependents-cancel"
          disabled={isPending}
          onClick={onCancel}
        >
          {t("ui.cancel")}
        </Button>
        <Button
          type="button"
          variant="danger"
          data-testid="setting-dependents-confirm"
          disabled={isPending}
          onClick={onConfirm}
        >
          {isPending
            ? t("settings.registry.saving")
            : t("settings.dependencies.confirmAction")}
        </Button>
      </ModalFooter>
    </ResponsiveSurface>
  );
}
