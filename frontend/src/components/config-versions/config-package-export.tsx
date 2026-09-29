import { Download } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { hintClassName } from "@/components/ui/control";
import { triggerBlobDownload } from "@/lib/download/trigger-blob-download";
import { exportConfigPackage } from "@/services/config-versions-api";
import type { ConfigVersion } from "@/services/config-versions-types";

interface ConfigPackageExportProperties {
  readonly version: ConfigVersion;
  readonly isBusy: boolean;
  readonly onError: (error: unknown) => void;
}

/** Paket 2.9 (K4): download an environment-neutral package of this version. */
export function ConfigPackageExport({ version, isBusy, onError }: ConfigPackageExportProperties) {
  const { t } = useTranslation();
  const [includeEnvironmentBound, setIncludeEnvironmentBound] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  return (
    <div className="grid gap-2 border-t border-border/60 pt-3">
      <p className="text-[13px] font-medium">{t("configVersions.package.exportHeading")}</p>
      <p className={hintClassName}>{t("configVersions.package.exportHint")}</p>
      <div className="pt-1">
        <Checkbox
          checked={includeEnvironmentBound}
          disabled={isBusy || isExporting}
          onChange={(event) => setIncludeEnvironmentBound(event.target.checked)}
          label={t("configVersions.package.includeEnvironmentBound")}
        />
      </div>
      <div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isBusy || isExporting}
          onClick={() => {
            setIsExporting(true);
            void exportConfigPackage(version.id, includeEnvironmentBound)
              .then((result) =>
                triggerBlobDownload(result.blob, result.fileName ?? `helpdesk-config-v${version.version}.json`),
              )
              .catch(onError)
              .finally(() => setIsExporting(false));
          }}
        >
          <Download /> {t("configVersions.package.export")}
        </Button>
      </div>
    </div>
  );
}
