import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Download, FileSpreadsheet, RotateCcw, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { errorTextClassName, hintClassName, tableHeadClassName, tableRowClassName } from "@/components/ui/control";
import { Field, Select } from "@/components/ui/field";
import { StatCard } from "@/components/ui/stat-card";
import { useToast } from "@/components/ui/toast";
import { WizardStepper } from "@/components/ui/wizard-stepper";
import { formatAssetDateTime, localizedName, mapAssetError } from "@/lib/assets/asset-view";
import { mapApiError } from "@/lib/map-api-error";
import {
  applyAssetImport,
  assetImportQueryKeys,
  assetQueryKeys,
  discardAssetImport,
  downloadAssetImportErrors,
  downloadAssetImportTemplate,
  getAssetCatalog,
  listAssetImports,
  previewAssetImport,
  type AssetImportApplyResult,
  type AssetImportMode,
  type AssetImportPreview,
  type AssetImportRowError,
  type AssetImportStatus,
} from "@/services/assets-api";

const acceptedFiles = ".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const statusTone: Readonly<Record<AssetImportStatus, "neutral" | "success" | "danger" | "warning">> = {
  PREVIEW: "warning",
  APPLIED: "success",
  FAILED: "danger",
  EXPIRED: "neutral",
};

/** Paket 3.2 (§11, §17.4): template → file → mapping → preview and confirmation. */
export function AssetImportPanel() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const catalogQuery = useQuery({ queryKey: assetQueryKeys.catalog(false), queryFn: () => getAssetCatalog(false), retry: false });
  const jobsQuery = useQuery({ queryKey: assetImportQueryKeys.jobs, queryFn: listAssetImports, retry: false });
  const types = (catalogQuery.data?.types ?? []).filter((type) => type.archivedAt === null);
  const [typeId, setTypeId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<AssetImportMode>("CREATE_ONLY");
  const [allOrNothing, setAllOrNothing] = useState(false);
  const [preview, setPreview] = useState<AssetImportPreview | null>(null);
  const [mapping, setMapping] = useState<(string | null)[]>([]);
  const [result, setResult] = useState<AssetImportApplyResult | null>(null);
  const [pending, setPending] = useState<"template" | "preview" | "apply" | "discard" | "errors" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectedType = typeId || types[0]?.id || "";
  const language = i18n.language.startsWith("en") ? "en" : "bs";

  const step = result ? 3 : preview ? (mappingChanged(preview, mapping) ? 2 : 3) : file ? 1 : 0;
  const steps = [
    { key: "template", label: t("assets.import.steps.template") },
    { key: "file", label: t("assets.import.steps.file") },
    { key: "mapping", label: t("assets.import.steps.mapping") },
    { key: "confirm", label: t("assets.import.steps.confirm") },
  ];

  const columnLabel = useMemo(() => {
    const map = new Map((preview?.columns ?? []).map((column) => [column.key, language === "bs" ? column.labelBs : column.labelEn]));
    return (key: string | null) => (key === null ? "—" : (map.get(key) ?? key));
  }, [preview, language]);

  async function run<T>(kind: NonNullable<typeof pending>, action: () => Promise<T>): Promise<T | null> {
    setPending(kind);
    setError(null);
    try {
      return await action();
    } catch (caught) {
      setError(t(mapAssetError(caught) ?? mapApiError(caught)));
      return null;
    } finally {
      setPending(null);
    }
  }

  function reset() {
    setFile(null);
    setPreview(null);
    setMapping([]);
    setResult(null);
    setError(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
    setPreview(null);
    setResult(null);
  }

  async function submitPreview(event?: FormEvent, withMapping = false) {
    event?.preventDefault();
    if (!file || !selectedType) return;
    const response = await run("preview", () =>
      previewAssetImport({ file, typeId: selectedType, mode, allOrNothing, ...(withMapping ? { mapping } : {}) }),
    );
    if (response) {
      setPreview(response);
      setMapping([...response.mapping]);
      void queryClient.invalidateQueries({ queryKey: assetImportQueryKeys.jobs });
    }
  }

  async function apply() {
    if (!preview) return;
    const response = await run("apply", () => applyAssetImport(preview.id));
    if (response) {
      setResult(response);
      toast({
        tone: response.status === "APPLIED" ? "success" : "danger",
        title: response.status === "APPLIED" ? t("assets.import.appliedTitle") : t("assets.import.failedTitle"),
        description: t("assets.import.appliedBody", response.applied),
      });
      void queryClient.invalidateQueries({ queryKey: assetQueryKeys.all });
    }
  }

  async function discard() {
    if (!preview) return;
    const done = await run("discard", () => discardAssetImport(preview.id));
    if (done !== null) {
      reset();
      void queryClient.invalidateQueries({ queryKey: assetImportQueryKeys.jobs });
    }
  }

  const describeError = (item: AssetImportRowError) =>
    t(`assets.import.errorCodes.${item.code}` as "assets.import.errorCodes.required", { defaultValue: item.code, value: item.value ?? "" });

  return (
    <div className="grid gap-4">
      <WizardStepper steps={steps} activeIndex={step} />

      <Card className="p-0">
        <CardHeader title={t("assets.import.setupTitle")} subtitle={t("assets.import.setupSubtitle")} />
        <form className="grid gap-3 p-4 md:grid-cols-2" onSubmit={(event) => void submitPreview(event)} noValidate>
          <Field label={t("assets.fields.type")} required hint={t("assets.import.typeHint")}>
            {(control) => (
              <Select
                {...control}
                value={selectedType}
                disabled={preview !== null}
                onChange={(event) => {
                  setTypeId(event.target.value);
                  setPreview(null);
                }}
              >
                {types.map((type) => (
                  <option key={type.id} value={type.id}>
                    {localizedName(type, i18n.language)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="flex items-end">
            <Button
              type="button"
              variant="outline"
              disabled={!selectedType || pending !== null}
              onClick={() => void run("template", () => downloadAssetImportTemplate(selectedType, language))}
            >
              <Download size={14} aria-hidden="true" />
              {pending === "template" ? t("ui.loading") : t("assets.import.downloadTemplate")}
            </Button>
          </div>
          <Field label={t("assets.import.file")} required hint={t("assets.import.fileHint")}>
            {(control) => (
              <input
                {...control}
                ref={fileInput}
                type="file"
                accept={acceptedFiles}
                disabled={preview !== null}
                onChange={onFile}
                className="block w-full text-[12.5px] file:mr-3 file:rounded-md file:border file:border-border file:bg-muted file:px-3 file:py-1.5 file:text-[12.5px] file:text-foreground"
              />
            )}
          </Field>
          <fieldset className="grid gap-1.5" disabled={preview !== null}>
            <legend className="mb-1 text-[12.5px] font-medium text-foreground">{t("assets.import.mode")}</legend>
            {(["CREATE_ONLY", "UPSERT"] as const).map((value) => (
              <label key={value} className="flex items-start gap-2 text-[12.5px]">
                <input type="radio" name="asset-import-mode" value={value} checked={mode === value} onChange={() => setMode(value)} className="mt-0.5" />
                <span>
                  <span className="block text-foreground">{t(`assets.import.modes.${value}` as const)}</span>
                  <span className={hintClassName}>{t(`assets.import.modeHints.${value}` as const)}</span>
                </span>
              </label>
            ))}
            <Checkbox label={t("assets.import.allOrNothing")} checked={allOrNothing} onChange={(event) => setAllOrNothing(event.target.checked)} />
          </fieldset>
          <div className="flex flex-wrap gap-2 md:col-span-2">
            {preview === null ? (
              <Button type="submit" variant="primary" disabled={!file || !selectedType || pending !== null}>
                <Upload size={14} aria-hidden="true" />
                {pending === "preview" ? t("ui.loading") : t("assets.import.previewAction")}
              </Button>
            ) : null}
            {preview !== null || file !== null ? (
              <Button type="button" variant="ghost" onClick={reset} disabled={pending !== null}>
                <RotateCcw size={14} aria-hidden="true" />
                {t("assets.import.startOver")}
              </Button>
            ) : null}
          </div>
        </form>
      </Card>

      {error ? (
        <p role="alert" className={errorTextClassName}>
          {error}
        </p>
      ) : null}

      {preview && !result ? (
        <>
          <Card className="p-0">
            <CardHeader title={t("assets.import.mappingTitle")} subtitle={t("assets.import.mappingSubtitle")} />
            <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
              {preview.headers.map((header, index) => (
                <Field key={`${header}-${index}`} label={header || t("assets.import.emptyHeader", { index: index + 1 })}>
                  {(control) => (
                    <Select
                      {...control}
                      value={mapping[index] ?? ""}
                      onChange={(event) => setMapping((current) => current.map((value, position) => (position === index ? event.target.value || null : value)))}
                    >
                      <option value="">{t("assets.import.ignoreColumn")}</option>
                      {preview.columns.map((column) => (
                        <option key={column.key} value={column.key} disabled={mapping.includes(column.key) && mapping[index] !== column.key}>
                          {language === "bs" ? column.labelBs : column.labelEn}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              ))}
            </div>
            {mappingChanged(preview, mapping) ? (
              <div className="px-4 pb-4">
                <Button variant="primary" size="sm" disabled={pending !== null} onClick={() => void submitPreview(undefined, true)}>
                  {pending === "preview" ? t("ui.loading") : t("assets.import.repreview")}
                </Button>
              </div>
            ) : null}
          </Card>

          <section aria-labelledby="asset-import-summary" className="grid gap-3">
            <h2 id="asset-import-summary" className="text-[14px] font-semibold text-foreground">
              {t("assets.import.summaryTitle", { file: preview.fileName })}
            </h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <StatCard label={t("assets.import.totals.create")} value={preview.totals.create} emphasis />
              <StatCard label={t("assets.import.totals.update")} value={preview.totals.update} />
              <StatCard label={t("assets.import.totals.unchanged")} value={preview.totals.unchanged} />
              <StatCard label={t("assets.import.totals.skipped")} value={preview.totals.skipped} />
              <StatCard label={t("assets.import.totals.errors")} value={preview.totals.errors} deltaTone={preview.totals.errors > 0 ? "danger" : undefined} />
            </div>
            {preview.duplicateOfJobId ? <p className={hintClassName}>{t("assets.import.duplicateFile")}</p> : null}
            <p className={hintClassName}>{t("assets.import.expires", { time: formatAssetDateTime(preview.expiresAt, i18n.language) })}</p>

            {preview.errorCount > 0 ? (
              <Card className="overflow-hidden p-0">
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <p className="text-[12.5px] text-foreground">{t("assets.import.errorsTitle", { count: preview.errorCount })}</p>
                  <Button variant="outline" size="sm" disabled={pending !== null} onClick={() => void run("errors", () => downloadAssetImportErrors(preview.id, language))}>
                    <FileSpreadsheet size={14} aria-hidden="true" />
                    {t("assets.import.downloadErrors")}
                  </Button>
                </div>
                <div className="max-h-[360px] overflow-auto border-t border-border/70">
                  <table className="w-full text-[12.5px]">
                    <caption className="sr-only">{t("assets.import.errorsCaption")}</caption>
                    <thead>
                      <tr className={tableHeadClassName}>
                        <th scope="col" className="px-3 py-2 text-left">{t("assets.import.row")}</th>
                        <th scope="col" className="px-3 py-2 text-left">{t("assets.import.column")}</th>
                        <th scope="col" className="px-3 py-2 text-left">{t("assets.import.problem")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.errors.map((item, index) => (
                        <tr key={`${item.row}-${item.column}-${index}`} className={tableRowClassName}>
                          <td className="px-3 py-2 tabular-nums">{item.row}</td>
                          <td className="px-3 py-2">{columnLabel(item.column)}</td>
                          <td className="px-3 py-2">{describeError(item)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {preview.errorCount > preview.errors.length ? (
                  <p className={`px-4 py-2 ${hintClassName}`}>{t("assets.import.moreErrors", { count: preview.errorCount - preview.errors.length })}</p>
                ) : null}
              </Card>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                disabled={pending !== null || mappingChanged(preview, mapping) || preview.totals.create + preview.totals.update === 0 || (preview.allOrNothing && preview.totals.errors > 0)}
                onClick={() => void apply()}
              >
                {pending === "apply" ? t("ui.loading") : t("assets.import.apply", { count: preview.totals.create + preview.totals.update })}
              </Button>
              <Button variant="ghost" disabled={pending !== null} onClick={() => void discard()}>
                {t("assets.import.discard")}
              </Button>
              {preview.allOrNothing && preview.totals.errors > 0 ? <span className={hintClassName}>{t("assets.import.allOrNothingBlocked")}</span> : null}
            </div>
          </section>
        </>
      ) : null}

      {result ? (
        <Card className="grid gap-2 p-4" role="status">
          <p className="text-[13px] font-semibold text-foreground">
            {result.status === "APPLIED" ? t("assets.import.appliedTitle") : t("assets.import.failedTitle")}
          </p>
          <p className="text-[12.5px] text-muted-foreground">{t("assets.import.appliedBody", result.applied)}</p>
          {result.failures.length > 0 ? (
            <ul className="list-disc pl-5 text-[12.5px]">
              {result.failures.slice(0, 20).map((failure, index) => (
                <li key={`${failure.row}-${index}`}>{t("assets.import.failureLine", { row: failure.row, problem: describeError(failure) })}</li>
              ))}
            </ul>
          ) : null}
          <div>
            <Button variant="outline" size="sm" onClick={reset}>
              {t("assets.import.another")}
            </Button>
          </div>
        </Card>
      ) : null}

      <Card className="overflow-hidden p-0">
        <CardHeader title={t("assets.import.historyTitle")} />
        {(jobsQuery.data?.items ?? []).length === 0 ? (
          <p className={`p-4 ${hintClassName}`}>{jobsQuery.isLoading ? t("ui.loading") : t("assets.import.historyEmpty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <caption className="sr-only">{t("assets.import.historyTitle")}</caption>
              <thead>
                <tr className={tableHeadClassName}>
                  <th scope="col" className="px-3 py-2 text-left">{t("assets.import.historyFile")}</th>
                  <th scope="col" className="px-3 py-2 text-left">{t("assets.fields.type")}</th>
                  <th scope="col" className="px-3 py-2 text-left">{t("assets.import.historyStatus")}</th>
                  <th scope="col" className="px-3 py-2 text-left">{t("assets.import.historyResult")}</th>
                  <th scope="col" className="px-3 py-2 text-left">{t("assets.import.historyWhen")}</th>
                </tr>
              </thead>
              <tbody>
                {(jobsQuery.data?.items ?? []).map((job) => (
                  <tr key={job.id} className={tableRowClassName}>
                    <td className="px-3 py-2">
                      <span className="block">{job.fileName}</span>
                      {job.createdBy ? <span className="block text-[11.5px] text-muted-foreground">{job.createdBy}</span> : null}
                    </td>
                    <td className="px-3 py-2">{job.type ? localizedName(job.type, i18n.language) : "—"}</td>
                    <td className="px-3 py-2">
                      <Badge tone={statusTone[job.status]}>{t(`assets.import.statuses.${job.status}` as const)}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      {job.totals.applied
                        ? t("assets.import.appliedBody", job.totals.applied)
                        : t("assets.import.previewResult", { create: job.totals.create, update: job.totals.update, errors: job.totals.errors })}
                    </td>
                    <td className="px-3 py-2">{formatAssetDateTime(job.appliedAt ?? job.createdAt, i18n.language)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function mappingChanged(preview: AssetImportPreview, mapping: readonly (string | null)[]): boolean {
  return preview.mapping.some((value, index) => (value ?? null) !== (mapping[index] ?? null));
}
