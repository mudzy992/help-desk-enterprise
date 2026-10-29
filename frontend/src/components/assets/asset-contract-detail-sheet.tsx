import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { AssetExpiryBadge } from "@/components/assets/asset-expiry-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { errorTextClassName, hintClassName } from "@/components/ui/control";
import { Input } from "@/components/ui/field";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import {
  assetStatusKeys,
  assetStatusTone,
  formatAssetDate,
  mapAssetError,
} from "@/lib/assets/asset-view";
import {
  entityMutationQueryKeys,
  invalidateEntityQueries,
} from "@/lib/entity-list/entity-mutation-query-keys";
import { useEntityMutation } from "@/lib/entity-list/use-entity-mutation";
import { mapApiError } from "@/lib/map-api-error";
import { queryKeys } from "@/lib/query/query-keys";
import {
  addContractItem,
  assetContractQueryKeys,
  deleteContract,
  getContract,
  lookupAssets,
  removeContractItem,
  type AssetContractItem,
} from "@/services/assets-api";
import { useCommercialSearch } from "./use-commercial-search";

export function ContractDetailSheet({
  contractId,
  canManage,
  onOpenChange,
  onEdit,
}: {
  readonly contractId: string | null;
  readonly canManage: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onEdit: (contract: AssetContractItem) => void;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const open = contractId !== null;
  const detailQuery = useQuery({
    queryKey: assetContractQueryKeys.contract(contractId ?? ""),
    queryFn: () => getContract(contractId ?? ""),
    enabled: open,
    retry: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const search = useCommercialSearch(searchText);

  useEffect(() => {
    setError(null);
    setSearchText("");
  }, [contractId]);

  const contract = detailQuery.data;
  const deleteMutation = useEntityMutation<string>({
    mutationFn: deleteContract,
    invalidate: () => [["assets", "contracts"]],
    onSuccess: () => {
      toast({ tone: "success", title: t("assets.contracts.deleted") });
      setDeleteOpen(false);
      onOpenChange(false);
    },
    onError: (caught) => setError(t(mapAssetError(caught) ?? mapApiError(caught))),
  });
  const candidatesQuery = useQuery({
    queryKey: queryKeys.assetContractCandidates(search),
    queryFn: () => lookupAssets(search),
    enabled: open && canManage && search.length >= 2,
    retry: false,
  });
  const linked = new Set(contract?.items.map((item) => item.id) ?? []);
  const candidates = (candidatesQuery.data?.items ?? []).filter((item) => !linked.has(item.id));

  async function run(action: () => Promise<unknown>, success: string) {
    setPending(true);
    setError(null);
    try {
      await action();
      toast({ tone: "success", title: success });
      void invalidateEntityQueries(queryClient, entityMutationQueryKeys.assets.contracts);
      return true;
    } catch (caught) {
      setError(t(mapAssetError(caught) ?? mapApiError(caught)));
      return false;
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="flex w-full max-w-md flex-col overflow-y-auto p-5">
          <SheetTitle>{contract?.supplier ?? t("assets.contracts.detailTitle")}</SheetTitle>
          <SheetDescription className="mt-1 text-[12px] text-muted-foreground">
            {contract
              ? `${t(`assets.contracts.kinds.${contract.kind}` as const)} · ${contract.organizationalUnit.name}`
              : t("ui.loading")}
          </SheetDescription>
          {detailQuery.isLoading ? <PanelSkeleton label={t("ui.loading")} /> : null}
          {detailQuery.error ? (
            <p role="alert" className={`mt-3 ${errorTextClassName}`}>
              {t(mapAssetError(detailQuery.error) ?? mapApiError(detailQuery.error))}
            </p>
          ) : null}
          {contract ? (
            <div className="mt-4 grid gap-4 text-[12.5px]">
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
                <dt className="text-muted-foreground">{t("assets.contracts.fields.reference")}</dt>
                <dd>{contract.reference ?? "—"}</dd>
                <dt className="text-muted-foreground">{t("assets.contracts.fields.startsAt")}</dt>
                <dd>{formatAssetDate(contract.startsAt, i18n.language)}</dd>
                <dt className="text-muted-foreground">{t("assets.contracts.fields.endsAt")}</dt>
                <dd className="flex items-center gap-1.5">
                  {formatAssetDate(contract.endsAt, i18n.language)}{" "}
                  <AssetExpiryBadge daysLeft={contract.daysLeft} />
                </dd>
                <dt className="text-muted-foreground">{t("assets.contracts.fields.cost")}</dt>
                <dd>{contract.cost ?? "—"}</dd>
              </dl>
              {contract.notes ? (
                <p className="whitespace-pre-wrap text-muted-foreground">{contract.notes}</p>
              ) : null}

              <section aria-labelledby="contract-items-title" className="grid gap-2">
                <h3 id="contract-items-title" className="text-[13px] font-semibold text-foreground">
                  {t("assets.contracts.itemsTitle", { count: contract.items.length })}
                </h3>
                {contract.items.length === 0 && contract.hiddenItemsCount === 0 ? (
                  <p className={hintClassName}>{t("assets.contracts.noItems")}</p>
                ) : null}
                <ul className="grid gap-1">
                  {contract.items.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-1.5"
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        {item.canOpen ? (
                          <Link
                            to={`/assets/${item.id}`}
                            className="truncate text-foreground underline-offset-2 hover:underline"
                          >
                            {item.assetTag} · {item.name}
                          </Link>
                        ) : (
                          <span className="truncate">
                            {item.assetTag} · {item.name}
                          </span>
                        )}
                        <Badge tone={assetStatusTone(item.status)}>
                          {t(assetStatusKeys[item.status])}
                        </Badge>
                      </span>
                      {canManage ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={t("assets.contracts.removeItem")}
                          disabled={pending}
                          onClick={() =>
                            void run(
                              () => removeContractItem(contract.id, item.id),
                              t("assets.contracts.itemRemoved"),
                            )
                          }
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
                {contract.hiddenItemsCount > 0 ? (
                  <p className={hintClassName}>
                    {t("assets.impact.hidden", { count: contract.hiddenItemsCount })}
                  </p>
                ) : null}
                {canManage ? (
                  <div className="grid gap-2 rounded-md border border-dashed border-border p-3">
                    <Input
                      type="search"
                      autoComplete="off"
                      aria-label={t("assets.contracts.searchAsset")}
                      placeholder={t("assets.contracts.searchAsset")}
                      value={searchText}
                      onChange={(event) => setSearchText(event.target.value)}
                    />
                    {candidates.map((candidate) => (
                      <div key={candidate.id} className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate">
                          {candidate.assetTag} · {candidate.name}
                        </span>
                        <Button
                          variant="outline"
                          size="xs"
                          disabled={pending}
                          onClick={() =>
                            void run(
                              () => addContractItem(contract.id, candidate.id),
                              t("assets.contracts.itemAdded"),
                            ).then((ok) => (ok ? setSearchText("") : undefined))
                          }
                        >
                          {t("assets.contracts.addItem")}
                        </Button>
                      </div>
                    ))}
                    {search.length >= 2 &&
                    candidatesQuery.data !== undefined &&
                    candidates.length === 0 ? (
                      <p className={hintClassName}>{t("assets.licenses.noCandidates")}</p>
                    ) : null}
                  </div>
                ) : null}
              </section>

              {error ? (
                <p role="alert" className={errorTextClassName}>
                  {error}
                </p>
              ) : null}
              {canManage ? (
                <div className="flex justify-between gap-2">
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={pending}
                    onClick={() => setDeleteOpen(true)}
                  >
                    {t("assets.contracts.delete")}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => onEdit(contract)}>
                    {t("assets.contracts.edit")}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t("assets.contracts.confirmDelete")}
        description={t("assets.contracts.confirmDelete")}
        intent="danger"
        confirmLabel={t("assets.contracts.delete")}
        isPending={deleteMutation.isPending}
        onConfirm={() => {
          if (contract) deleteMutation.mutate(contract.id);
        }}
      />
    </>
  );
}
