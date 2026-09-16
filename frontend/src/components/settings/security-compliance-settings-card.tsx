import { FileCheck, Lock, ShieldCheck, UserCog } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { SettingsCategoryDrawer } from "@/components/settings/settings-category-drawer";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { securityFeatureKeys } from "@/lib/settings/is-featured-setting-key";
import {
  filterSettingsByPrefix,
  readBooleanSetting,
} from "@/lib/settings/read-setting-entry";
import type { SettingsSaveInput } from "@/lib/settings/use-settings-registry";
import type { SettingRegistryEntry } from "@/services/settings-api";

type SecurityLabelKey =
  | "settings.security.redaction"
  | "settings.security.confidential"
  | "settings.security.audit"
  | "settings.security.readOnly";

type SecurityRowId = "redaction" | "confidential" | "audit" | "readOnly";

interface SecurityComplianceSettingsCardProperties {
  readonly entries: readonly SettingRegistryEntry[];
  readonly canWrite: boolean;
  readonly pendingKey: string | null;
  readonly onSave: (input: SettingsSaveInput) => Promise<void>;
}

export function SecurityComplianceSettingsCard({
  entries,
  canWrite,
  pendingKey,
  onSave,
}: SecurityComplianceSettingsCardProperties) {
  const { t } = useTranslation();
  const [openRow, setOpenRow] = useState<SecurityRowId | null>(null);
  const rows = useMemo(
    () => [
      {
        id: "redaction" as const,
        icon: Lock,
        labelKey: "settings.security.redaction" as const satisfies SecurityLabelKey,
        enabled: readBooleanSetting(entries, securityFeatureKeys.redactionEnabled),
        prefixes: ["private.security.redaction.", "private.security.safeLogging."],
      },
      {
        id: "confidential" as const,
        icon: ShieldCheck,
        labelKey: "settings.security.confidential" as const satisfies SecurityLabelKey,
        enabled:
          readBooleanSetting(entries, securityFeatureKeys.confidentialEnabled) &&
          readBooleanSetting(entries, securityFeatureKeys.breakGlassEnabled, true),
        prefixes: ["private.ticket.confidential."],
      },
      {
        id: "audit" as const,
        icon: FileCheck,
        labelKey: "settings.security.audit" as const satisfies SecurityLabelKey,
        enabled:
          readBooleanSetting(entries, securityFeatureKeys.auditExportEnabled) &&
          readBooleanSetting(entries, securityFeatureKeys.tamperEvidentEnabled),
        prefixes: ["private.audit."],
      },
      {
        id: "readOnly" as const,
        icon: UserCog,
        labelKey: "settings.security.readOnly" as const satisfies SecurityLabelKey,
        enabled: readBooleanSetting(entries, securityFeatureKeys.readOnlyModeEnabled),
        prefixes: ["private.readOnlyMode."],
      },
    ],
    [entries],
  );
  const activeRow = rows.find((row) => row.id === openRow) ?? null;
  const drawerEntries = useMemo(() => {
    if (activeRow === null) {
      return [];
    }
    return activeRow.prefixes.flatMap((prefix) =>
      filterSettingsByPrefix(entries, prefix),
    );
  }, [activeRow, entries]);

  return (
    <>
      <Card>
        <CardHeader title={t("settings.security.title")} />
        <div className="space-y-2 px-4 py-4">
          {rows.map((row) => (
            <button
              key={row.id}
              type="button"
              className="flex w-full items-center gap-2.5 rounded-md border border-border/60 bg-background/40 px-3 py-2 text-left transition-colors hover:border-[#31405C]"
              onClick={() => setOpenRow(row.id)}
            >
              <row.icon
                size={14}
                className={row.enabled ? "text-[#4ADE80]" : "text-muted-foreground/60"}
              />
              <span className="flex-1 text-[12px] text-foreground/90">
                {t(row.labelKey)}
              </span>
              <Badge tone={row.enabled ? "success" : "neutral"} dot={false}>
                {row.enabled
                  ? t("settings.security.enabled")
                  : t("settings.security.disabled")}
              </Badge>
            </button>
          ))}
        </div>
      </Card>
      <SettingsCategoryDrawer
        open={openRow !== null}
        title={activeRow ? t(activeRow.labelKey) : t("settings.security.title")}
        description={t("settings.security.drawerDescription")}
        entries={drawerEntries}
        canWrite={canWrite}
        pendingKey={pendingKey}
        onOpenChange={(open) => {
          if (!open) {
            setOpenRow(null);
          }
        }}
        onSave={onSave}
      />
    </>
  );
}
