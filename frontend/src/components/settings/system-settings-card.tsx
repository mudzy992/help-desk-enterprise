import { FileCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { installSettingKeys } from "@/lib/settings/is-featured-setting-key";
import { readStringSetting } from "@/lib/settings/read-setting-entry";
import {
  listConfigVersions,
  type ConfigVersion,
} from "@/services/config-versions-api";
import type { SettingRegistryEntry } from "@/services/settings-api";

interface SystemSettingsCardProperties {
  readonly entries: readonly SettingRegistryEntry[];
}

export function SystemSettingsCard({ entries }: SystemSettingsCardProperties) {
  const { t } = useTranslation();
  const [activeVersion, setActiveVersion] = useState<ConfigVersion | null>(null);
  const installCompletedAt = readStringSetting(
    entries,
    installSettingKeys.completedAt,
  );

  useEffect(() => {
    let cancelled = false;
    void listConfigVersions()
      .then((versions) => {
        if (cancelled) {
          return;
        }
        const active =
          versions.find((version) => version.status === "ACTIVE") ?? null;
        setActiveVersion(active);
      })
      .catch(() => {
        if (!cancelled) {
          setActiveVersion(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card className="fade-in">
      <CardHeader
        title={t("settings.system.title")}
        subtitle={t("settings.system.subtitle")}
      />
      <div className="space-y-2.5 px-4 py-4 text-[12px]">
        <p className="flex justify-between gap-2">
          <span className="text-muted-foreground">ConfigVersion</span>
          {activeVersion ? (
            <Badge tone="primary" dot={false}>
              v{activeVersion.version}
            </Badge>
          ) : (
            <span className="text-foreground/90">—</span>
          )}
        </p>
        <p className="flex justify-between gap-2">
          <span className="text-muted-foreground">{t("settings.system.validation")}</span>
          <Badge tone="success" dot>
            <FileCheck size={10} /> {t("settings.system.validationReady")}
          </Badge>
        </p>
        <p className="flex justify-between gap-2">
          <span className="text-muted-foreground">{t("settings.system.installWizard")}</span>
          <span className="text-foreground/90">
            {installCompletedAt.length > 0
              ? t("settings.system.installLocked", {
                  date: formatInstallDate(installCompletedAt),
                })
              : t("settings.system.installOpen")}
          </span>
        </p>
        <div className="flex flex-wrap gap-2 border-t border-border/70 pt-3">
          <Button asChild variant="outline" size="xs">
            <Link to="/admin/config-versions">{t("settings.system.openConfigVersions")}</Link>
          </Button>
          {activeVersion ? (
            <Button asChild variant="ghost" size="xs">
              <Link to="/admin/config-versions">
                {t("settings.system.openValidation")}
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

function formatInstallDate(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return value;
  }
  return new Date(parsed).toLocaleDateString();
}
