import { useEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { errorTextClassName, hintClassName } from "@/components/ui/control";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import {
  assetStatusKeys,
  assetStatusTransitions,
  assetStatusesNeedingReason,
  mapAssetError,
} from "@/lib/assets/asset-view";
import { mapApiError } from "@/lib/map-api-error";
import { changeAssetStatus, searchAssetUsers, type AssetDetail, type AssetStatus, type AssetUserSummary } from "@/services/assets-api";
import { AssetTransferIssued, AssetTransferSection, useTransferPreview } from "@/components/assets/asset-transfer-section";
import { moveAssets, type AssetMovementResult } from "@/services/asset-transfers-api";

interface ActionSheetProperties {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly asset: AssetDetail;
  readonly onDone: () => void;
}

/**
 * C9b: assign/unassign work on one asset (card) or on several selected in the
 * register with the same holder (one transfer record for all).
 */
export type AssetMoveSubject = {
  readonly id: string;
  readonly assignedUser: AssetUserSummary | null;
  readonly assetIds?: readonly string[];
};

interface MoveSheetProperties {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly asset: AssetMoveSubject;
  readonly onDone: () => void;
}

function subjectIds(asset: AssetMoveSubject): string[] {
  return asset.assetIds && asset.assetIds.length > 0 ? [...asset.assetIds] : [asset.id];
}

function useActionState(open: boolean) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) setError(null);
  }, [open]);
  return { pending, setPending, error, setError };
}

/** Paket 3.2 (§5): status change; LOST, RETIRED and DISPOSED need a reason. */
export function AssetStatusSheet({ open, onOpenChange, asset, onDone }: ActionSheetProperties) {
  const { t } = useTranslation();
  const targets = assetStatusTransitions[asset.status];
  const [status, setStatus] = useState<AssetStatus | "">("");
  const [reason, setReason] = useState("");
  const { pending, setPending, error, setError } = useActionState(open);

  useEffect(() => {
    if (open) {
      setStatus(targets[0] ?? "");
      setReason("");
    }
  }, [open, targets]);

  const needsReason = status !== "" && assetStatusesNeedingReason.includes(status);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (status === "") return;
    setPending(true);
    setError(null);
    try {
      await changeAssetStatus(asset.id, status, reason.trim());
      onDone();
      onOpenChange(false);
    } catch (caught) {
      setError(t(mapAssetError(caught) ?? mapApiError(caught)));
    } finally {
      setPending(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full max-w-md flex-col overflow-y-auto p-5">
        <SheetTitle>{t("assets.actions.changeStatus")}</SheetTitle>
        <SheetDescription className="mt-1 text-[12px] text-muted-foreground">
          {t("assets.statusSheet.current", { status: t(assetStatusKeys[asset.status]) })}
        </SheetDescription>
        {targets.length === 0 ? (
          <p className={`mt-4 ${hintClassName}`}>{t("assets.statusSheet.final")}</p>
        ) : (
          <form className="mt-4 grid gap-3" onSubmit={(event) => void submit(event)} noValidate>
            <Field label={t("assets.statusSheet.newStatus")} required>
              {(control) => (
                <Select {...control} value={status} onChange={(event) => setStatus(event.target.value as AssetStatus)}>
                  {targets.map((target) => (
                    <option key={target} value={target}>
                      {t(assetStatusKeys[target])}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            {status === "RETIRED" || status === "LOST" || status === "IN_STOCK" ? (
              <p className={hintClassName}>{t("assets.statusSheet.releaseHint")}</p>
            ) : null}
            {status === "DISPOSED" ? <p className={hintClassName}>{t("assets.statusSheet.disposedHint")}</p> : null}
            <Field label={t("assets.statusSheet.reason")} required={needsReason}>
              {(control) => <Textarea {...control} rows={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />}
            </Field>
            {error ? (
              <p role="alert" className={errorTextClassName}>
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                {t("ui.cancel")}
              </Button>
              <Button
                type="submit"
                variant={status === "DISPOSED" ? "danger" : "primary"}
                disabled={pending || status === "" || (needsReason && reason.trim().length === 0)}
              >
                {pending ? t("ui.loading") : t("assets.statusSheet.submit")}
              </Button>
            </div>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}

/**
 * Paket 3.2 (§7, C9 §7a): assign / reassign. Goes through `/assets/movements`
 * so the move and its transfer record are one step; with records off the
 * move is only written to the history.
 */
export function AssetAssignSheet({ open, onOpenChange, asset, onDone }: MoveSheetProperties) {
  const ids = subjectIds(asset);
  const { t } = useTranslation();
  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");
  const [userId, setUserId] = useState("");
  const [note, setNote] = useState("");
  const [fromLabel, setFromLabel] = useState("");
  const [issueDocument, setIssueDocument] = useState(true);
  const [result, setResult] = useState<AssetMovementResult | null>(null);
  const { pending, setPending, error, setError } = useActionState(open);
  const scenario = asset.assignedUser ? "USER_TO_USER" : "WAREHOUSE_TO_USER";

  useEffect(() => {
    if (open) {
      setSearchText("");
      setSearch("");
      setUserId("");
      setNote("");
      setFromLabel("");
      setIssueDocument(true);
      setResult(null);
    }
  }, [open]);

  useEffect(() => {
    const handle = window.setTimeout(() => setSearch(searchText.trim()), 300);
    return () => window.clearTimeout(handle);
  }, [searchText]);

  const usersQuery = useQuery({
    queryKey: ["assets", "users", search],
    queryFn: () => searchAssetUsers(search),
    enabled: open && search.length >= 2,
    retry: false,
  });
  const users = usersQuery.data?.items ?? [];
  const preview = useTransferPreview(open && userId !== "" && result === null, {
    scenario,
    assetIds: ids,
    toUserId: userId,
    fromLabel: fromLabel.trim() || undefined,
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (userId === "") return;
    setPending(true);
    setError(null);
    try {
      const moved = await moveAssets({
        scenario,
        assetIds: ids,
        toUserId: userId,
        fromLabel: scenario === "WAREHOUSE_TO_USER" ? fromLabel.trim() || undefined : undefined,
        note: note.trim() || undefined,
        issueDocument,
      });
      onDone();
      if (moved.transferId) setResult(moved);
      else onOpenChange(false);
    } catch (caught) {
      setError(t(mapAssetError(caught) ?? mapApiError(caught)));
    } finally {
      setPending(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full max-w-md flex-col overflow-y-auto p-5">
        <SheetTitle>{asset.assignedUser ? t("assets.actions.reassign") : t("assets.actions.assign")}</SheetTitle>
        <SheetDescription className="mt-1 text-[12px] text-muted-foreground">
          {asset.assignedUser
            ? t("assets.assignSheet.currentUser", { name: asset.assignedUser.displayName })
            : t("assets.assignSheet.description")}
          {ids.length > 1 ? <span className="mt-1 block">{t("assets.bulk.selectedCount", { count: ids.length })}</span> : null}
        </SheetDescription>
        {result ? (
          <AssetTransferIssued result={result} onClose={() => onOpenChange(false)} />
        ) : (
          <form className="mt-4 grid gap-3" onSubmit={(event) => void submit(event)} noValidate>
            <Field label={t("assets.assignSheet.search")} hint={t("assets.assignSheet.searchHint")}>
              {(control) => (
                <Input {...control} type="search" value={searchText} autoComplete="off" onChange={(event) => setSearchText(event.target.value)} />
              )}
            </Field>
            {search.length >= 2 ? (
              <fieldset className="grid gap-1">
                <legend className="sr-only">{t("assets.assignSheet.results")}</legend>
                {usersQuery.isLoading ? <p className={hintClassName}>{t("ui.loading")}</p> : null}
                {!usersQuery.isLoading && users.length === 0 ? <p className={hintClassName}>{t("assets.assignSheet.noUsers")}</p> : null}
                {users.map((user) => (
                  <label
                    key={user.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-[12.5px] has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                  >
                    <input type="radio" name="asset-assign-user" value={user.id} checked={userId === user.id} onChange={() => setUserId(user.id)} />
                    <span className="min-w-0">
                      <span className="block truncate text-foreground">{user.displayName}</span>
                      <span className="block truncate text-[11.5px] text-muted-foreground">{user.email}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
            ) : null}
            {scenario === "WAREHOUSE_TO_USER" && preview.configuration?.enabled ? (
              <Field label={t("assets.transfers.fromLabel")} hint={t("assets.transfers.fromLabelHint")}>
                {(control) => <Input {...control} maxLength={200} value={fromLabel} onChange={(event) => setFromLabel(event.target.value)} />}
              </Field>
            ) : null}
            <Field label={t("assets.assignSheet.note")}>
              {(control) => <Textarea {...control} rows={2} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} />}
            </Field>
            <AssetTransferSection preview={preview} issueDocument={issueDocument} onIssueDocumentChange={setIssueDocument} />
            {error ? (
              <p role="alert" className={errorTextClassName}>
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                {t("ui.cancel")}
              </Button>
              <Button type="submit" variant="primary" disabled={pending || userId === ""}>
                {pending ? t("ui.loading") : t("assets.assignSheet.submit")}
              </Button>
            </div>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** Paket 3.2 (§7, C9 §7a): return equipment to stock or send it to repair. */
export function AssetUnassignSheet({ open, onOpenChange, asset, onDone }: MoveSheetProperties) {
  const ids = subjectIds(asset);
  const { t } = useTranslation();
  const [status, setStatus] = useState<"IN_STOCK" | "IN_REPAIR">("IN_STOCK");
  const [note, setNote] = useState("");
  const [toLabel, setToLabel] = useState("");
  const [issueDocument, setIssueDocument] = useState(true);
  const [result, setResult] = useState<AssetMovementResult | null>(null);
  const { pending, setPending, error, setError } = useActionState(open);

  useEffect(() => {
    if (open) {
      setStatus("IN_STOCK");
      setNote("");
      setToLabel("");
      setIssueDocument(true);
      setResult(null);
    }
  }, [open]);

  const preview = useTransferPreview(open && asset.assignedUser !== null && result === null, {
    scenario: "USER_TO_WAREHOUSE",
    assetIds: ids,
    returnStatus: status,
    toLabel: toLabel.trim() || undefined,
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const moved = await moveAssets({
        scenario: "USER_TO_WAREHOUSE",
        assetIds: ids,
        returnStatus: status,
        toLabel: toLabel.trim() || undefined,
        note: note.trim() || undefined,
        issueDocument,
      });
      onDone();
      if (moved.transferId) setResult(moved);
      else onOpenChange(false);
    } catch (caught) {
      setError(t(mapAssetError(caught) ?? mapApiError(caught)));
    } finally {
      setPending(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full max-w-md flex-col overflow-y-auto p-5">
        <SheetTitle>{t("assets.actions.unassign")}</SheetTitle>
        <SheetDescription className="mt-1 text-[12px] text-muted-foreground">
          {t("assets.unassignSheet.description", { name: asset.assignedUser?.displayName ?? "—" })}
          {ids.length > 1 ? <span className="mt-1 block">{t("assets.bulk.selectedCount", { count: ids.length })}</span> : null}
        </SheetDescription>
        {result ? (
          <AssetTransferIssued result={result} onClose={() => onOpenChange(false)} />
        ) : (
          <form className="mt-4 grid gap-3" onSubmit={(event) => void submit(event)} noValidate>
            <Field label={t("assets.unassignSheet.nextStatus")}>
              {(control) => (
                <Select {...control} value={status} onChange={(event) => setStatus(event.target.value === "IN_REPAIR" ? "IN_REPAIR" : "IN_STOCK")}>
                  <option value="IN_STOCK">{t(assetStatusKeys.IN_STOCK)}</option>
                  <option value="IN_REPAIR">{t(assetStatusKeys.IN_REPAIR)}</option>
                </Select>
              )}
            </Field>
            {preview.configuration?.enabled ? (
              <Field label={t("assets.transfers.toLabel")} hint={t("assets.transfers.toLabelHint")}>
                {(control) => <Input {...control} maxLength={200} value={toLabel} onChange={(event) => setToLabel(event.target.value)} />}
              </Field>
            ) : null}
            <Field label={t("assets.assignSheet.note")}>
              {(control) => <Textarea {...control} rows={2} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} />}
            </Field>
            <AssetTransferSection preview={preview} issueDocument={issueDocument} onIssueDocumentChange={setIssueDocument} />
            {error ? (
              <p role="alert" className={errorTextClassName}>
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                {t("ui.cancel")}
              </Button>
              <Button type="submit" variant="primary" disabled={pending}>
                {pending ? t("ui.loading") : t("assets.unassignSheet.submit")}
              </Button>
            </div>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
