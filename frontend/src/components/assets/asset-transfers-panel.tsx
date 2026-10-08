import { useEffect, useRef, useState, type FormEvent } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Ban, FileCheck2, FileDown, FileText, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilterBar, FilterField } from "@/components/ui/filter-bar";
import { Card } from "@/components/ui/card";
import { errorTextClassName, hintClassName, selectCompactClassName } from "@/components/ui/control";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Textarea } from "@/components/ui/field";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { signedCopyAccept, signedCopyMaxBytes, transferScenarioKeys, transferStatusKeys, transferStatusTone } from "@/lib/assets/asset-transfer-view";
import { formatAssetDate, mapAssetError } from "@/lib/assets/asset-view";
import { mapApiError } from "@/lib/map-api-error";
import {
  assetTransferQueryKeys,
  assetTransferScenarios,
  assetTransferStatuses,
  cancelAssetTransfer,
  downloadSignedTransfer,
  downloadTransferDocument,
  listAssetTransfers,
  listAssetTransfersForAsset,
  listMyAssetTransfers,
  uploadSignedTransfer,
  type AssetTransferFilters,
  type AssetTransferListItem,
  type AssetTransferScenario,
  type AssetTransferStatus,
} from "@/services/asset-transfers-api";

type PanelMode = { readonly kind: "all" } | { readonly kind: "asset"; readonly assetId: string } | { readonly kind: "mine" };

interface AssetTransfersPanelProperties {
  readonly mode: PanelMode;
  /** asset.manage: cancel and signed copies (the server checks the unit scope again). */
  readonly canManage: boolean;
}

/**
 * Paket 3.2 C9 (§7a.7): transfer records. The register (all records in the
 * viewer's scope), one asset's records and "my" records share this panel.
 */
export function AssetTransfersPanel({ mode, canManage }: AssetTransfersPanelProperties) {
  const { t } = useTranslation();
  const [searchText, setSearchText] = useState("");
  const [filters, setFilters] = useState<AssetTransferFilters>({});
  const [cancelling, setCancelling] = useState<AssetTransferListItem | null>(null);

  useEffect(() => {
    const handle = window.setTimeout(() => setFilters((current) => ({ ...current, search: searchText.trim() || undefined })), 300);
    return () => window.clearTimeout(handle);
  }, [searchText]);

  const registerQuery = useInfiniteQuery({
    queryKey: assetTransferQueryKeys.list(filters),
    queryFn: ({ pageParam }) => listAssetTransfers({ ...filters, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: mode.kind === "all",
    retry: false,
  });
  const scopedQuery = useQuery({
    queryKey: mode.kind === "asset" ? assetTransferQueryKeys.forAsset(mode.assetId) : assetTransferQueryKeys.mine,
    queryFn: () => (mode.kind === "asset" ? listAssetTransfersForAsset(mode.assetId) : listMyAssetTransfers()),
    enabled: mode.kind !== "all",
    retry: false,
  });

  const items = mode.kind === "all" ? (registerQuery.data?.pages.flatMap((page) => page.items) ?? []) : (scopedQuery.data ?? []);
  const loading = mode.kind === "all" ? registerQuery.isLoading : scopedQuery.isLoading;
  const error = mode.kind === "all" ? registerQuery.error : scopedQuery.error;

  return (
    <div className="grid gap-3">
      {mode.kind === "all" ? (
        <FilterBar
          label={t("assets.transfers.search")}
          searchLabel={t("assets.transfers.search")}
          searchPlaceholder={t("assets.transfers.searchPlaceholder")}
          searchValue={searchText}
          onSearchChange={setSearchText}
          activeCount={[filters.status, filters.scenario].filter(Boolean).length}
          onReset={() => {
            setSearchText("");
            setFilters((current) => ({ ...current, status: undefined, scenario: undefined, search: undefined }));
          }}
        >
          <FilterField label={t("assets.transfers.statusFilter")}>
            <select
              className={`${selectCompactClassName} w-full`}
              aria-label={t("assets.transfers.statusFilter")}
              value={filters.status ?? ""}
              onChange={(event) => setFilters((current) => ({ ...current, status: (event.target.value || undefined) as AssetTransferStatus | undefined }))}
            >
              <option value="">{t("assets.transfers.statusFilter")}: {t("assets.transfers.any")}</option>
              {assetTransferStatuses.map((status) => (
                <option key={status} value={status}>
                  {t(transferStatusKeys[status])}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label={t("assets.transfers.scenarioFilter")}>
            <select
              className={`${selectCompactClassName} w-full`}
              aria-label={t("assets.transfers.scenarioFilter")}
              value={filters.scenario ?? ""}
              onChange={(event) => setFilters((current) => ({ ...current, scenario: (event.target.value || undefined) as AssetTransferScenario | undefined }))}
            >
              <option value="">{t("assets.transfers.scenarioFilter")}: {t("assets.transfers.any")}</option>
              {assetTransferScenarios.map((scenario) => (
                <option key={scenario} value={scenario}>
                  {t(transferScenarioKeys[scenario])}
                </option>
              ))}
            </select>
          </FilterField>
        </FilterBar>
      ) : null}
      {loading ? <PanelSkeleton label={t("ui.loading")} /> : null}
      {error ? (
        <p role="alert" className={errorTextClassName}>
          {t(mapAssetError(error) ?? mapApiError(error))}
        </p>
      ) : null}
      {!loading && !error && items.length === 0 ? (
        <EmptyState icon={<FileText size={18} />} title={t("assets.transfers.emptyTitle")} body={t(mode.kind === "mine" ? "assets.transfers.emptyMine" : "assets.transfers.emptyBody")} />
      ) : null}
      {items.length > 0 ? (
        <ul className="grid gap-2" aria-label={t("assets.transfers.listLabel")}>
          {items.map((item) => (
            <TransferRow key={item.id} item={item} canManage={canManage && mode.kind !== "mine"} showItems={mode.kind !== "asset"} onCancel={() => setCancelling(item)} />
          ))}
        </ul>
      ) : null}
      {mode.kind === "all" && registerQuery.hasNextPage ? (
        <Button type="button" variant="outline" className="justify-self-center" disabled={registerQuery.isFetchingNextPage} onClick={() => void registerQuery.fetchNextPage()}>
          {registerQuery.isFetchingNextPage ? t("ui.loading") : t("assets.transfers.loadMore")}
        </Button>
      ) : null}
      <CancelTransferSheet transfer={cancelling} onOpenChange={(open) => (open ? undefined : setCancelling(null))} />
    </div>
  );
}

function TransferRow({
  item,
  canManage,
  showItems,
  onCancel,
}: {
  readonly item: AssetTransferListItem;
  readonly canManage: boolean;
  readonly showItems: boolean;
  readonly onCancel: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"docx" | "signed" | "upload" | null>(null);

  async function run(kind: "docx" | "signed" | "upload", action: () => Promise<unknown>, successTitle?: string) {
    setBusy(kind);
    try {
      await action();
      if (successTitle) toast({ tone: "success", title: successTitle });
    } catch (caught) {
      toast({ tone: "danger", title: t("assets.transfers.actionFailed"), description: t(mapAssetError(caught) ?? mapApiError(caught)), error: caught });
    } finally {
      setBusy(null);
    }
  }

  function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > signedCopyMaxBytes) {
      toast({ tone: "danger", title: t("assets.transfers.actionFailed"), description: t("assets.errors.transferFileTooLarge") });
      return;
    }
    void run(
      "upload",
      async () => {
        await uploadSignedTransfer(item.id, file);
        await queryClient.invalidateQueries({ queryKey: assetTransferQueryKeys.all });
      },
      t("assets.transfers.signedUploaded", { number: item.number }),
    );
  }

  return (
    <li>
      <Card className="grid gap-2 p-3 md:grid-cols-[1fr_auto] md:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[13px] font-semibold text-foreground">{item.number}</span>
            <Badge tone={transferStatusTone(item.status)}>{t(transferStatusKeys[item.status])}</Badge>
            <span className="text-[12px] text-muted-foreground">{t(transferScenarioKeys[item.scenario])}</span>
          </div>
          <p className="mt-1 truncate text-[12.5px] text-foreground">
            {item.from.name || "—"} → {item.to.name || "—"}
          </p>
          <p className="text-[11.5px] text-muted-foreground">
            {formatAssetDate(item.issuedAt, i18n.language)}
            {item.signatoryName ? ` · ${t("assets.transfers.signatory")}: ${item.signatoryName}` : ""}
            {` · ${t("assets.transfers.itemCount", { count: item.itemCount })}`}
          </p>
          {showItems && item.items.length > 0 ? (
            <p className="truncate text-[11.5px] text-muted-foreground">
              {item.items.map((entry, index) => (
                <span key={entry.assetId}>
                  {index > 0 ? ", " : ""}
                  <Link to={`/assets/${entry.assetId}`} className="underline-offset-2 hover:underline">
                    {entry.assetTag}
                  </Link>
                </span>
              ))}
              {item.itemCount > item.items.length ? " …" : ""}
            </p>
          ) : null}
          {item.status === "CANCELLED" && item.cancelReason ? (
            <p className="text-[11.5px] text-muted-foreground">{t("assets.transfers.cancelledBecause", { reason: item.cancelReason })}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1.5 md:justify-end">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy !== null}
            onClick={() => void run("docx", () => downloadTransferDocument(item.id, item.number))}
            aria-label={t("assets.transfers.downloadDocxFor", { number: item.number })}
          >
            <FileDown size={14} aria-hidden="true" />
            DOCX
          </Button>
          {item.hasSignedCopy ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() => void run("signed", () => downloadSignedTransfer(item.id, item.number))}
              aria-label={t("assets.transfers.downloadSignedFor", { number: item.number })}
            >
              <FileCheck2 size={14} aria-hidden="true" />
              {t("assets.transfers.signedCopy")}
            </Button>
          ) : null}
          {canManage && item.status !== "CANCELLED" ? (
            <>
              <input ref={fileInput} type="file" accept={signedCopyAccept} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(event) => { onFile(event.target.files?.[0]); event.target.value = ""; }} />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy !== null}
                onClick={() => fileInput.current?.click()}
                aria-label={t(item.hasSignedCopy ? "assets.transfers.replaceSignedFor" : "assets.transfers.uploadSignedFor", { number: item.number })}
              >
                <Upload size={14} aria-hidden="true" />
                {busy === "upload" ? t("ui.loading") : t(item.hasSignedCopy ? "assets.transfers.replaceSigned" : "assets.transfers.uploadSigned")}
              </Button>
            </>
          ) : null}
          {canManage && item.status === "ISSUED" ? (
            <Button type="button" size="sm" variant="ghost" disabled={busy !== null} onClick={onCancel} aria-label={t("assets.transfers.cancelFor", { number: item.number })}>
              <Ban size={14} aria-hidden="true" />
              {t("assets.transfers.cancel")}
            </Button>
          ) : null}
        </div>
      </Card>
    </li>
  );
}

function CancelTransferSheet({ transfer, onOpenChange }: { readonly transfer: AssetTransferListItem | null; readonly onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (transfer) {
      setReason("");
      setError(null);
    }
  }, [transfer]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!transfer) return;
    setPending(true);
    setError(null);
    try {
      await cancelAssetTransfer(transfer.id, reason.trim());
      await queryClient.invalidateQueries({ queryKey: assetTransferQueryKeys.all });
      toast({ tone: "success", title: t("assets.transfers.cancelled", { number: transfer.number }) });
      onOpenChange(false);
    } catch (caught) {
      setError(t(mapAssetError(caught) ?? mapApiError(caught)));
    } finally {
      setPending(false);
    }
  }

  return (
    <Sheet open={transfer !== null} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full max-w-md flex-col overflow-y-auto p-5">
        <SheetTitle>{t("assets.transfers.cancelTitle", { number: transfer?.number ?? "" })}</SheetTitle>
        <SheetDescription className="mt-1 text-[12px] text-muted-foreground">{t("assets.transfers.cancelDescription")}</SheetDescription>
        <form className="mt-4 grid gap-3" onSubmit={(event) => void submit(event)} noValidate>
          <Field label={t("assets.transfers.cancelReason")} required hint={t("assets.transfers.cancelReasonHint")}>
            {(control) => <Textarea {...control} rows={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />}
          </Field>
          <p className={hintClassName}>{t("assets.transfers.cancelNoRollback")}</p>
          {error ? (
            <p role="alert" className={errorTextClassName}>
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("ui.cancel")}
            </Button>
            <Button type="submit" variant="danger" disabled={pending || reason.trim().length < 5}>
              {pending ? t("ui.loading") : t("assets.transfers.cancelSubmit")}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
