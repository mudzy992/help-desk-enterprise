import { Upload } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  controlClassName,
  hintClassName,
  labelClassName,
  selectCompactClassName,
  tableHeadClassName,
  tableRowClassName,
  tableWrapClassName,
} from "@/components/ui/control";
import { ScrollRegion } from "@/components/ui/scroll-region";
import {
  canMapConfigPackageItem,
  configPackageImportReady,
  unresolvedConfigPackageItems,
  withConfigPackageMapping,
} from "@/lib/config-versions/config-package-mapping";
import {
  importConfigPackage,
  previewConfigPackageImport,
  type ConfigPackageImportInput,
} from "@/services/config-versions-api";
import type {
  ConfigPackageImportReport,
  ConfigPackageMappings,
  ConfigPackageSignatureState,
  ConfigVersion,
} from "@/services/config-versions-types";

const maxPackageBytes = 5 * 1024 * 1024;

const signatureTones: Record<ConfigPackageSignatureState, BadgeTone> = {
  valid: "success",
  invalid: "danger",
  unsigned: "warning",
  no_key: "warning",
};

interface ConfigPackageImportProperties {
  readonly isBusy: boolean;
  /** Wraps the call with the workspace busy/error handling; false on failure. */
  readonly runAction: (operation: () => Promise<void>) => Promise<boolean>;
  readonly onImported: (version: ConfigVersion) => void;
}

/**
 * Paket 2.9 (K4): upload → preview (resolution report, manual mappings) →
 * import as DRAFT. Nothing is activated here.
 */
export function ConfigPackageImport({ isBusy, runAction, onImported }: ConfigPackageImportProperties) {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [fileTooLarge, setFileTooLarge] = useState(false);
  const [mappings, setMappings] = useState<ConfigPackageMappings>({});
  const [applyEnvironmentBound, setApplyEnvironmentBound] = useState(false);
  const [confirmUnsigned, setConfirmUnsigned] = useState(false);
  const [releaseNotes, setReleaseNotes] = useState("");
  const [report, setReport] = useState<ConfigPackageImportReport | null>(null);
  const [inputKey, setInputKey] = useState(0);

  const input = (nextMappings: ConfigPackageMappings = mappings): ConfigPackageImportInput | null =>
    file === null
      ? null
      : { file, mappings: nextMappings, applyEnvironmentBound, confirmUnsigned, releaseNotes };

  const preview = (nextMappings?: ConfigPackageMappings) => {
    const request = input(nextMappings);
    if (request === null) {
      return;
    }
    void runAction(async () => {
      setReport(await previewConfigPackageImport(request));
    });
  };

  const reset = () => {
    setFile(null);
    setMappings({});
    setApplyEnvironmentBound(false);
    setConfirmUnsigned(false);
    setReleaseNotes("");
    setReport(null);
    setInputKey((key) => key + 1);
  };

  const unresolved = report === null ? [] : unresolvedConfigPackageItems(report);
  const ready = report !== null && configPackageImportReady(report, confirmUnsigned);

  return (
    <div className="grid gap-3">
      <label className={labelClassName}>
        {t("configVersions.package.file")}
        <input
          key={inputKey}
          type="file"
          accept="application/json,.json"
          className={controlClassName}
          disabled={isBusy}
          onChange={(event) => {
            const selected = event.target.files?.[0] ?? null;
            const tooLarge = selected !== null && selected.size > maxPackageBytes;
            setFileTooLarge(tooLarge);
            setFile(tooLarge ? null : selected);
            setMappings({});
            setReport(null);
          }}
        />
      </label>
      {fileTooLarge ? (
        <p className="text-[12.5px] text-danger" role="alert">
          {t("configVersions.errorPackageTooLarge")}
        </p>
      ) : null}
      <div>
        <Button type="button" size="sm" variant="outline" disabled={isBusy || file === null} onClick={() => preview()}>
          <Upload /> {t("configVersions.package.preview")}
        </Button>
      </div>

      {report !== null ? (
        <div className="grid gap-3" aria-live="polite">
          <dl className="grid gap-x-4 gap-y-1 text-[12.5px] sm:grid-cols-[max-content_1fr]">
            <dt className="text-muted-foreground">{t("configVersions.package.source")}</dt>
            <dd>
              {t("configVersions.package.sourceValue", {
                environment: report.header.sourceEnvironment || "?",
                version: report.header.sourceVersion,
                date: new Date(report.header.exportedAt).toLocaleString(),
              })}
            </dd>
            <dt className="text-muted-foreground">{t("configVersions.package.signature")}</dt>
            <dd>
              <Badge tone={signatureTones[report.signature]}>
                {t(`configVersions.package.signatureStates.${report.signature}`)}
              </Badge>
            </dd>
            <dt className="text-muted-foreground">{t("configVersions.package.settings")}</dt>
            <dd>
              {t("configVersions.package.settingsValue", {
                applied: report.settings.applied.length,
                environmentBound: report.settings.skippedEnvironmentBound.length,
                unknown: report.settings.skippedUnknown.length,
              })}
            </dd>
            {report.created.calendars.length + report.created.slaProfiles.length > 0 ? (
              <>
                <dt className="text-muted-foreground">{t("configVersions.package.created")}</dt>
                <dd>{[...report.created.calendars, ...report.created.slaProfiles].join(", ")}</dd>
              </>
            ) : null}
            {Object.entries(report.skipped)
              .filter(([, keys]) => keys.length > 0)
              .map(([kind, keys]) => (
                <div key={kind} className="contents">
                  <dt className="text-muted-foreground">
                    {t("configVersions.package.skipped", {
                      kind: t(`configVersions.package.skippedKinds.${kind}`, { defaultValue: kind }),
                    })}
                  </dt>
                  <dd>{keys.join(", ")}</dd>
                </div>
              ))}
          </dl>

          {unresolved.length > 0 ? (
            <ScrollRegion className={tableWrapClassName}>
              <table className="w-full min-w-[640px] text-left text-[13px]">
                <caption className="sr-only">{t("configVersions.package.referencesCaption")}</caption>
                <thead className={`border-b border-border/70 ${tableHeadClassName}`}>
                  <tr>
                    <th className="px-3 py-2">{t("configVersions.package.columnKind")}</th>
                    <th className="px-3 py-2">{t("configVersions.package.columnKey")}</th>
                    <th className="px-3 py-2">{t("configVersions.package.columnStatus")}</th>
                    <th className="px-3 py-2">{t("configVersions.package.columnMapping")}</th>
                  </tr>
                </thead>
                <tbody>
                  {unresolved.map((item) => {
                    const candidates = report.candidates[item.kind] ?? [];
                    const mappedId = mappings[item.kind]?.[item.key] ?? "";
                    return (
                      <tr key={`${item.kind}:${item.key}`} className={tableRowClassName}>
                        <td className="px-3">{t(`configVersions.package.kinds.${item.kind}`)}</td>
                        <td className="px-3 font-mono text-[12px]" title={item.usedBy.join(", ")}>
                          {item.key}
                        </td>
                        <td className="px-3">
                          <Badge tone={item.blocking ? "danger" : item.status === "mapped" ? "success" : "neutral"}>
                            {t(
                              item.blocking
                                ? "configVersions.package.statusBlocking"
                                : `configVersions.package.statuses.${item.status}`,
                            )}
                          </Badge>
                        </td>
                        <td className="px-3">
                          {canMapConfigPackageItem(report, item.kind) ? (
                            <select
                              className={selectCompactClassName}
                              aria-label={t("configVersions.package.mapTo", { key: item.key })}
                              value={mappedId}
                              disabled={isBusy}
                              onChange={(event) => {
                                const next = withConfigPackageMapping(mappings, item.kind, item.key, event.target.value);
                                setMappings(next);
                                preview(next);
                              }}
                            >
                              <option value="">{t("configVersions.package.noMapping")}</option>
                              {candidates.map((candidate) => (
                                <option key={candidate.id} value={candidate.id}>
                                  {candidate.key}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className={hintClassName}>
                              {t(
                                item.blocking
                                  ? "configVersions.package.notMappableBlocking"
                                  : "configVersions.package.notMappable",
                              )}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ScrollRegion>
          ) : (
            <p className={hintClassName}>{t("configVersions.package.allResolved")}</p>
          )}

          <div className="grid gap-2 pt-1">
            {report.header.includesEnvironmentBound ? (
              <Checkbox
                checked={applyEnvironmentBound}
                disabled={isBusy}
                onChange={(event) => setApplyEnvironmentBound(event.target.checked)}
                label={t("configVersions.package.applyEnvironmentBound")}
              />
            ) : null}
            {report.signature !== "valid" && report.signature !== "invalid" ? (
              <Checkbox
                checked={confirmUnsigned}
                disabled={isBusy}
                onChange={(event) => setConfirmUnsigned(event.target.checked)}
                label={t("configVersions.package.confirmUnsigned")}
              />
            ) : null}
          </div>
          <label className={labelClassName}>
            {t("configVersions.package.releaseNotes")}
            <input
              className={controlClassName}
              value={releaseNotes}
              maxLength={4000}
              disabled={isBusy}
              onChange={(event) => setReleaseNotes(event.target.value)}
            />
          </label>
          <p className={hintClassName}>{t("configVersions.package.draftHint")}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={isBusy || !ready}
              onClick={() => {
                const request = input();
                if (request === null) {
                  return;
                }
                void runAction(async () => {
                  const created = await importConfigPackage(request);
                  reset();
                  onImported(created);
                });
              }}
            >
              {t("configVersions.package.import")}
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={isBusy} onClick={reset}>
              {t("configVersions.package.cancel")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
