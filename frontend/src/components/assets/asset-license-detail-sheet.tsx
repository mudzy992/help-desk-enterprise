import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Eye, Trash2 } from "lucide-react";
import { AssetExpiryBadge } from "@/components/assets/asset-expiry-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { errorTextClassName, hintClassName } from "@/components/ui/control";
import { Input, Select } from "@/components/ui/field";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { formatAssetDate, mapAssetError } from "@/lib/assets/asset-view";
import {
  entityMutationQueryKeys,
  invalidateEntityQueries,
} from "@/lib/entity-list/entity-mutation-query-keys";
import { useEntityMutation } from "@/lib/entity-list/use-entity-mutation";
import { mapApiError } from "@/lib/map-api-error";
import { queryKeys } from "@/lib/query/query-keys";
import {
  assetContractQueryKeys,
  assignLicense,
  deleteLicense,
  getLicense,
  lookupAssets,
  releaseLicense,
  revealLicenseKey,
  searchLicenseUsers,
  type SoftwareLicenseItem,
} from "@/services/assets-api";
import { useCommercialSearch } from "./use-commercial-search";

export function LicenseDetailSheet({
  licenseId,
  canManage,
  onOpenChange,
  onEdit,
}: {
  readonly licenseId: string | null;
  readonly canManage: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onEdit: (license: SoftwareLicenseItem) => void;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const open = licenseId !== null;
  const detailQuery = useQuery({
    queryKey: assetContractQueryKeys.license(licenseId ?? ""),
    queryFn: () => getLicense(licenseId ?? ""),
    enabled: open,
    retry: false,
  });
  const [revealed, setRevealed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [target, setTarget] = useState<"asset" | "user">("asset");
  const [searchText, setSearchText] = useState("");
  const search = useCommercialSearch(searchText);

  useEffect(() => {
    setRevealed(null);
    setError(null);
    setSearchText("");
  }, [licenseId]);

  const license = detailQuery.data;
  const deleteMutation = useEntityMutation<string>({
    mutationFn: deleteLicense,
    invalidate: () => [["assets", "licenses"]],
    onSuccess: () => {
      toast({ tone: "success", title: t("assets.licenses.deleted") });
      setDeleteOpen(false);
      onOpenChange(false);
    },
    onError: (caught) => setError(t(mapAssetError(caught) ?? mapApiError(caught))),
  });
  const effectiveTarget =
    license?.assignmentTarget === "user"
      ? "user"
      : license?.assignmentTarget === "asset"
        ? "asset"
        : target;
  const candidatesQuery = useQuery({
    queryKey: queryKeys.assetLicenseCandidates(licenseId ?? "", effectiveTarget, search),
    queryFn: async () =>
      effectiveTarget === "asset"
        ? (await lookupAssets(search)).items.map((item) => ({
            id: item.id,
            title: `${item.assetTag} · ${item.name}`,
            subtitle: item.assignedUser?.displayName ?? "",
          }))
        : (await searchLicenseUsers(licenseId ?? "", search)).items.map((item) => ({
            id: item.id,
            title: item.displayName,
            subtitle: item.email,
          })),
    enabled:
      open &&
      canManage &&
      search.length >= 2 &&
      license !== undefined &&
      license.assignmentTarget !== "none",
    retry: false,
  });

  async function run(action: () => Promise<unknown>, success?: string) {
    setPending(true);
    setError(null);
    try {
      await action();
      if (success) toast({ tone: "success", title: success });
      void invalidateEntityQueries(queryClient, entityMutationQueryKeys.assets.licenses);
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
          <SheetTitle>{license?.productName ?? t("assets.licenses.detailTitle")}</SheetTitle>
          <SheetDescription className="mt-1 text-[12px] text-muted-foreground">
            {license
              ? `${t(`assets.licenses.kinds.${license.kind}` as const)} · ${license.organizationalUnit.name}`
              : t("ui.loading")}
          </SheetDescription>
          {detailQuery.isLoading ? <PanelSkeleton label={t("ui.loading")} /> : null}
          {detailQuery.error ? (
            <p role="alert" className={`mt-3 ${errorTextClassName}`}>
              {t(mapAssetError(detailQuery.error) ?? mapApiError(detailQuery.error))}
            </p>
          ) : null}
          {license ? (
            <div className="mt-4 grid gap-4 text-[12.5px]">
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
                <dt className="text-muted-foreground">{t("assets.licenses.fields.vendor")}</dt>
                <dd>{license.vendor ?? "—"}</dd>
                <dt className="text-muted-foreground">{t("assets.licenses.fields.usage")}</dt>
                <dd className="flex items-center gap-1.5">
                  {license.seats === null
                    ? t("assets.licenses.usageUnlimited", { used: license.used })
                    : t("assets.licenses.usage", { used: license.used, seats: license.seats })}
                  {license.overAllocated ? (
                    <Badge tone="danger">{t("assets.licenses.overAllocated")}</Badge>
                  ) : null}
                </dd>
                <dt className="text-muted-foreground">{t("assets.licenses.fields.validUntil")}</dt>
                <dd className="flex items-center gap-1.5">
                  {formatAssetDate(license.validUntil, i18n.language)}{" "}
                  <AssetExpiryBadge daysLeft={license.daysLeft} />
                </dd>
                <dt className="text-muted-foreground">{t("assets.licenses.fields.cost")}</dt>
                <dd>{license.cost ?? "—"}</dd>
                <dt className="text-muted-foreground">{t("assets.licenses.fields.licenseKey")}</dt>
                <dd>
                  {!license.hasKey ? (
                    "—"
                  ) : revealed !== null ? (
                    <code className="break-all rounded bg-muted px-1.5 py-0.5 text-[12px]">
                      {revealed}
                    </code>
                  ) : canManage ? (
                    <Button
                      variant="outline"
                      size="xs"
                      disabled={pending}
                      onClick={() =>
                        void run(async () =>
                          setRevealed((await revealLicenseKey(license.id)).licenseKey),
                        )
                      }
                    >
                      <Eye size={12} aria-hidden="true" />
                      {t("assets.licenses.reveal")}
                    </Button>
                  ) : (
                    t("assets.licenses.keyHidden")
                  )}
                </dd>
              </dl>
              {license.notes ? (
                <p className="whitespace-pre-wrap text-muted-foreground">{license.notes}</p>
              ) : null}

              <section aria-labelledby="license-assignments-title" className="grid gap-2">
                <h3
                  id="license-assignments-title"
                  className="text-[13px] font-semibold text-foreground"
                >
                  {t("assets.licenses.assignmentsTitle")}
                </h3>
                {license.assignmentTarget === "none" ? (
                  <p className={hintClassName}>{t("assets.licenses.siteHint")}</p>
                ) : null}
                {license.assignments.length === 0 &&
                license.hiddenAssignmentsCount === 0 &&
                license.assignmentTarget !== "none" ? (
                  <p className={hintClassName}>{t("assets.licenses.noAssignments")}</p>
                ) : null}
                <ul className="grid gap-1">
                  {license.assignments.map((assignment) => (
                    <li
                      key={assignment.id}
                      className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-1.5"
                    >
                      <span className="min-w-0 truncate">
                        {assignment.asset ? (
                          <Link
                            to={`/assets/${assignment.asset.id}`}
                            className="text-foreground underline-offset-2 hover:underline"
                          >
                            {assignment.asset.assetTag} · {assignment.asset.name}
                          </Link>
                        ) : (
                          <>
                            {assignment.user?.displayName ?? "—"}
                            {assignment.user && !assignment.user.isActive ? (
                              <Badge tone="warning" className="ml-1">
                                {t("assets.licenses.inactiveUser")}
                              </Badge>
                            ) : null}
                          </>
                        )}
                      </span>
                      {canManage ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={t("assets.licenses.release")}
                          disabled={pending}
                          onClick={() =>
                            void run(
                              () => releaseLicense(license.id, assignment.id),
                              t("assets.licenses.released"),
                            )
                          }
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
                {license.hiddenAssignmentsCount > 0 ? (
                  <p className={hintClassName}>
                    {t("assets.licenses.hiddenAssignments", {
                      count: license.hiddenAssignmentsCount,
                    })}
                  </p>
                ) : null}
                {canManage && license.assignmentTarget !== "none" ? (
                  <div className="grid gap-2 rounded-md border border-dashed border-border p-3">
                    {license.assignmentTarget === "either" ? (
                      <Select
                        aria-label={t("assets.licenses.assignTarget")}
                        value={target}
                        onChange={(event) => setTarget(event.target.value as "asset" | "user")}
                      >
                        <option value="asset">{t("assets.licenses.targetAsset")}</option>
                        <option value="user">{t("assets.licenses.targetUser")}</option>
                      </Select>
                    ) : null}
                    <Input
                      type="search"
                      autoComplete="off"
                      aria-label={
                        effectiveTarget === "asset"
                          ? t("assets.licenses.searchAsset")
                          : t("assets.licenses.searchUser")
                      }
                      placeholder={
                        effectiveTarget === "asset"
                          ? t("assets.licenses.searchAsset")
                          : t("assets.licenses.searchUser")
                      }
                      value={searchText}
                      onChange={(event) => setSearchText(event.target.value)}
                    />
                    {(candidatesQuery.data ?? []).map((candidate) => (
                      <div key={candidate.id} className="flex items-center justify-between gap-2">
                        <span className="min-w-0">
                          <span className="block truncate">{candidate.title}</span>
                          {candidate.subtitle ? (
                            <span className="block truncate text-[11.5px] text-muted-foreground">
                              {candidate.subtitle}
                            </span>
                          ) : null}
                        </span>
                        <Button
                          variant="outline"
                          size="xs"
                          disabled={pending}
                          onClick={() =>
                            void run(
                              () =>
                                assignLicense(
                                  license.id,
                                  effectiveTarget === "asset"
                                    ? { assetId: candidate.id }
                                    : { userId: candidate.id },
                                ),
                              t("assets.licenses.assigned"),
                            ).then((ok) => (ok ? setSearchText("") : undefined))
                          }
                        >
                          {t("assets.licenses.assign")}
                        </Button>
                      </div>
                    ))}
                    {search.length >= 2 && candidatesQuery.data?.length === 0 ? (
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
                    {t("assets.licenses.delete")}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => onEdit(license)}>
                    {t("assets.licenses.edit")}
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
        title={t("assets.licenses.confirmDelete")}
        description={t("assets.licenses.confirmDelete")}
        intent="danger"
        confirmLabel={t("assets.licenses.delete")}
        isPending={deleteMutation.isPending}
        onConfirm={() => {
          if (license) deleteMutation.mutate(license.id);
        }}
      />
    </>
  );
}
