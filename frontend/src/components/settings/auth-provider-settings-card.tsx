import { KeyRound } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { SettingsCategoryDrawer } from "@/components/settings/settings-category-drawer";
import { SettingsReasonConfirm } from "@/components/settings/settings-reason-confirm";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { hintClassName } from "@/components/ui/control";
import { authSettingKeys } from "@/lib/settings/is-featured-setting-key";
import {
  filterSettingsByPrefix,
  readStringSetting,
} from "@/lib/settings/read-setting-entry";
import type { SettingsSaveInput } from "@/lib/settings/use-settings-registry";
import { cn } from "@/lib/utils";
import type { SettingRegistryEntry } from "@/services/settings-api";

interface AuthProviderSettingsCardProperties {
  readonly entries: readonly SettingRegistryEntry[];
  readonly canWrite: boolean;
  readonly pendingKey: string | null;
  readonly onSave: (input: SettingsSaveInput) => Promise<void>;
}

export function AuthProviderSettingsCard({
  entries,
  canWrite,
  pendingKey,
  onSave,
}: AuthProviderSettingsCardProperties) {
  const { t } = useTranslation();
  const mode = readStringSetting(entries, authSettingKeys.mode, "local");
  const [draftMode, setDraftMode] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const authEntries = useMemo(
    () => filterSettingsByPrefix(entries, "private.auth."),
    [entries],
  );
  const detailEntries = useMemo(
    () => authEntries.filter((entry) => entry.key !== authSettingKeys.mode),
    [authEntries],
  );
  const pendingMode = draftMode ?? mode;
  const isEntra = pendingMode === "entra_ad";

  return (
    <>
      <Card>
        <CardHeader
          title={t("settings.auth.title")}
          subtitle={t("settings.auth.subtitle")}
        />
        <div className="space-y-3 px-4 py-4">
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { id: "local", nameKey: "settings.auth.local", descKey: "settings.auth.localDesc" },
                { id: "entra_ad", nameKey: "settings.auth.entra", descKey: "settings.auth.entraDesc" },
              ] as const
            ).map((provider) => (
              <button
                key={provider.id}
                type="button"
                disabled={!canWrite || pendingKey === authSettingKeys.mode}
                className={cn(
                  "rounded-lg border p-3 text-left transition-all",
                  pendingMode === provider.id
                    ? "border-primary/50 bg-primary/8"
                    : "border-border bg-background/40 hover:border-[#31405C]",
                )}
                onClick={() => setDraftMode(provider.id)}
              >
                <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-foreground">
                  <KeyRound size={13} className="text-[#7FA8F5]" />
                  {t(provider.nameKey)}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {t(provider.descKey)}
                </p>
              </button>
            ))}
          </div>
          {isEntra ? (
            <div className="flex items-center justify-between gap-2">
              <p className={hintClassName}>{t("settings.auth.entraSummary")}</p>
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={() => setDrawerOpen(true)}
              >
                {t("settings.drawer.edit")}
              </Button>
            </div>
          ) : null}
          <p className="text-[11px] leading-4 text-muted-foreground/70">
            {t("settings.auth.breakGlass")}
          </p>
          {draftMode !== null && draftMode !== mode ? (
            <SettingsReasonConfirm
              pending={pendingKey === authSettingKeys.mode}
              onCancel={() => setDraftMode(null)}
              onConfirm={async (reason) => {
                await onSave({
                  key: authSettingKeys.mode,
                  value: draftMode,
                  reason,
                });
                setDraftMode(null);
              }}
            />
          ) : null}
        </div>
      </Card>
      <SettingsCategoryDrawer
        open={drawerOpen}
        title={t("settings.auth.drawerTitle")}
        description={t("settings.auth.drawerDescription")}
        entries={detailEntries}
        canWrite={canWrite}
        pendingKey={pendingKey}
        onOpenChange={setDrawerOpen}
        onSave={onSave}
      />
    </>
  );
}
