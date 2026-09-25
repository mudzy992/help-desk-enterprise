import { ArrowDown, ArrowUp, Download, FileSpreadsheet, Play } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { tableHeadClassName, tableRowClassName, tableWrapClassName } from "@/components/ui/control";
import { EmptyState } from "@/components/ui/empty-state";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { triggerBlobDownload } from "@/lib/download/trigger-blob-download";
import { mapApiError, readApiRequestId, type ApiErrorKey } from "@/lib/map-api-error";
import {
  formatReportCell,
  nextReportSort,
  sortReportRows,
  type ReportSort,
} from "@/lib/reports/report-pack-table";
import { cn } from "@/lib/utils";
import {
  downloadReportPack,
  listReportPacks,
  previewReportPack,
  type ReportExportFormat,
  type ReportPackDescriptor,
  type ReportPackList,
  type ReportPackPreview,
} from "@/services/report-packs-api";

interface ReportPacksPanelProperties {
  readonly organizationalUnitId: string | null;
  readonly from: string;
  readonly to: string;
}

/**
 * Package 1.6 (plan §3 D2): choose a pack → "Show" (first rows, not audited)
 * → download CSV/JSON (audited). A change of pack, unit or period clears the
 * preview so what is on screen always matches what would be downloaded.
 */
export function ReportPacksPanel({ organizationalUnitId, from, to }: ReportPacksPanelProperties) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [list, setList] = useState<ReportPackList | null>(null);
  const [listError, setListError] = useState<ApiErrorKey | null>(null);
  const [selected, setSelected] = useState<ReportPackDescriptor | null>(null);
  const [preview, setPreview] = useState<ReportPackPreview | null>(null);
  const [previewError, setPreviewError] = useState<{ key: ApiErrorKey; requestId: string | null } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [downloading, setDownloading] = useState<ReportExportFormat | null>(null);
  const [sort, setSort] = useState<ReportSort | null>(null);

  useEffect(() => {
    if (organizationalUnitId === null) return;
    let cancelled = false;
    listReportPacks(organizationalUnitId)
      .then((loaded) => {
        if (cancelled) return;
        setList(loaded);
        setSelected((current) => current ?? loaded.packs[0] ?? null);
      })
      .catch((error: unknown) => !cancelled && setListError(mapApiError(error)));
    return () => {
      cancelled = true;
    };
  }, [organizationalUnitId]);

  useEffect(() => {
    setPreview(null);
    setPreviewError(null);
    setSort(null);
  }, [selected, organizationalUnitId, from, to]);

  const scope = organizationalUnitId === null ? null : { organizationalUnitId, from, to };
  const columnLabel = (column: string) =>
    t(`reports.packs.columns.${column}`, { defaultValue: column });
  const rows = useMemo(
    () => (preview === null ? [] : sortReportRows(preview.rows, sort, i18n.language)),
    [preview, sort, i18n.language],
  );

  const showPreview = async () => {
    if (selected === null || scope === null) return;
    setLoadingPreview(true);
    setPreviewError(null);
    try {
      setPreview(await previewReportPack(selected.slug, scope));
    } catch (error) {
      setPreview(null);
      setPreviewError({ key: mapApiError(error), requestId: readApiRequestId(error) });
    } finally {
      setLoadingPreview(false);
    }
  };

  const download = async (format: ReportExportFormat) => {
    if (selected === null || scope === null) return;
    setDownloading(format);
    try {
      const file = await downloadReportPack(selected.slug, scope, format);
      triggerBlobDownload(file.blob, file.fileName);
      toast({ tone: "success", title: t("reports.packs.downloaded", { file: file.fileName }) });
    } catch (error) {
      toast({ tone: "danger", title: t(mapApiError(error)) });
    } finally {
      setDownloading(null);
    }
  };

  if (listError !== null) {
    return <ApiErrorText messageKey={listError} requestId={null} />;
  }
  if (list === null) {
    return <PanelSkeleton className="mt-0" label={t("reports.packs.title")} />;
  }
  if (list.packs.length === 0) {
    return (
      <EmptyState
        icon={<FileSpreadsheet size={18} strokeWidth={1.8} />}
        title={t("reports.packs.noneTitle")}
        body={t("reports.packs.noneBody")}
      />
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]" data-testid="report-packs">
      <div className="space-y-2" role="listbox" aria-label={t("reports.packs.title")}>
        {list.packs.map((pack) => {
          const active = selected?.key === pack.key;
          return (
            <button
              key={pack.key}
              type="button"
              role="option"
              aria-selected={active}
              data-testid={`report-pack-${pack.slug}`}
              onClick={() => setSelected(pack)}
              className={cn(
                "w-full rounded-lg border px-3 py-2.5 text-left transition-colors",
                active
                  ? "border-primary/60 bg-primary/5"
                  : "border-border bg-surface hover:bg-surface-hover",
              )}
            >
              <div className="text-[13px] font-semibold text-foreground">
                {t(`reports.packs.names.${pack.key}`)}
              </div>
              <p className="mt-0.5 text-[12px] leading-4 text-muted-foreground">
                {t(`reports.packs.descriptions.${pack.key}`, {
                  threshold: list.pingPongThreshold,
                })}
              </p>
            </button>
          );
        })}
      </div>

      <Card className="min-w-0 p-0">
        <CardHeader
          title={selected === null ? "" : t(`reports.packs.names.${selected.key}`)}
          subtitle={t("reports.packs.scopeHint", {
            from: new Date(from).toLocaleDateString(i18n.language),
            to: new Date(to).toLocaleDateString(i18n.language),
            max: list.limits.maxWindowDays,
          })}
          actions={
            <>
              <Button
                size="sm"
                onClick={() => void showPreview()}
                disabled={selected === null || scope === null || loadingPreview}
                data-testid="report-pack-preview"
              >
                <Play size={13} /> {t("reports.packs.show")}
              </Button>
              {list.formats.map((format) => (
                <Button
                  key={format}
                  size="sm"
                  variant="outline"
                  onClick={() => void download(format)}
                  disabled={selected === null || scope === null || downloading !== null}
                  data-testid={`report-pack-download-${format}`}
                >
                  <Download size={13} />
                  {t("reports.packs.download", { format: format.toUpperCase() })}
                </Button>
              ))}
            </>
          }
        />
        <div className="p-4">
          {loadingPreview ? (
            <PanelSkeleton className="mt-0" label={t("reports.packs.show")} />
          ) : previewError !== null ? (
            <ApiErrorText messageKey={previewError.key} requestId={previewError.requestId} />
          ) : preview === null ? (
            <p className="text-[12.5px] text-muted-foreground">{t("reports.packs.pressShow")}</p>
          ) : preview.totalRows === 0 ? (
            <EmptyState
              icon={<FileSpreadsheet size={18} strokeWidth={1.8} />}
              title={t("reports.packs.emptyTitle")}
              body={t("reports.packs.emptyBody")}
            />
          ) : (
            <>
              <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
                <Badge data-testid="report-pack-total">
                  {t("reports.packs.rows", { count: preview.totalRows })}
                </Badge>
                {preview.truncated ? (
                  <span>{t("reports.packs.truncated", { shown: preview.rows.length })}</span>
                ) : null}
              </div>
              <div className={tableWrapClassName}>
                <table className="w-full text-[12.5px]" data-testid="report-pack-table">
                  <thead className="border-b border-border/70 bg-surface-hover/60">
                    <tr>
                      {preview.columns.map((column) => {
                        const active = sort?.column === column;
                        return (
                          <th
                            key={column}
                            scope="col"
                            aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
                            className={cn(tableHeadClassName, "whitespace-nowrap px-3 py-2 text-left")}
                          >
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 hover:text-foreground"
                              onClick={() => setSort((current) => nextReportSort(current, column))}
                            >
                              {columnLabel(column)}
                              {active ? (
                                sort.direction === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />
                              ) : null}
                            </button>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => (
                      <tr key={index} className={tableRowClassName}>
                        {preview.columns.map((column) => {
                          const value = row[column] ?? null;
                          return (
                            <td
                              key={column}
                              className={cn(
                                "px-3 align-top",
                                typeof value === "number" ? "text-right tabular-nums" : "",
                              )}
                            >
                              {formatReportCell(value, i18n.language, {
                                confidential: t("reports.packs.confidential"),
                                values: {
                                  agent_service: t("reports.packs.rowTypes.agent_service"),
                                  agent_total: t("reports.packs.rowTypes.agent_total"),
                                  total: t("reports.packs.rowTypes.total"),
                                },
                              })}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
