import { useEffect, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { errorTextClassName, hintClassName } from "@/components/ui/control";
import { Field, Input } from "@/components/ui/field";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { mapAssetError } from "@/lib/assets/asset-view";
import { mapApiError } from "@/lib/map-api-error";
import { assetTransferQueryKeys, saveAssetSignatory } from "@/services/asset-transfers-api";
import { searchAssetUsers } from "@/services/assets-api";

export type SignatorySheetUnit = {
  readonly id: string;
  readonly name: string;
  readonly own: { readonly userId: string; readonly displayName: string; readonly title: string | null } | null;
};

/** Paket 3.2 C9c: pick the transfer-record signatory of one organizational unit. */
export function AssetSignatorySheet({ unit, onOpenChange }: { readonly unit: SignatorySheetUnit | null; readonly onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");
  const [userId, setUserId] = useState("");
  const [title, setTitle] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (unit) {
      setSearchText("");
      setSearch("");
      setUserId(unit.own?.userId ?? "");
      setTitle(unit.own?.title ?? "");
      setError(null);
    }
  }, [unit]);

  useEffect(() => {
    const handle = window.setTimeout(() => setSearch(searchText.trim()), 300);
    return () => window.clearTimeout(handle);
  }, [searchText]);

  const usersQuery = useQuery({
    queryKey: ["assets", "users", search],
    queryFn: () => searchAssetUsers(search),
    enabled: unit !== null && search.length >= 2,
    retry: false,
  });
  const users = usersQuery.data?.items ?? [];

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!unit || userId === "") return;
    setPending(true);
    setError(null);
    try {
      await saveAssetSignatory(unit.id, userId, title.trim());
      await queryClient.invalidateQueries({ queryKey: assetTransferQueryKeys.signatories });
      onOpenChange(false);
    } catch (caught) {
      setError(t(mapAssetError(caught) ?? mapApiError(caught)));
    } finally {
      setPending(false);
    }
  }

  return (
    <Sheet open={unit !== null} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full max-w-md flex-col overflow-y-auto p-5">
        <SheetTitle>{t("assets.transfers.signatories.sheetTitle", { unit: unit?.name ?? "" })}</SheetTitle>
        <SheetDescription className="mt-1 text-[12px] text-muted-foreground">{t("assets.transfers.signatories.sheetDescription")}</SheetDescription>
        <form className="mt-4 grid gap-3" onSubmit={(event) => void submit(event)} noValidate>
          {unit?.own ? <p className={hintClassName}>{t("assets.transfers.signatories.current", { name: unit.own.displayName })}</p> : null}
          <Field label={t("assets.assignSheet.search")} hint={t("assets.assignSheet.searchHint")}>
            {(control) => <Input {...control} type="search" value={searchText} autoComplete="off" onChange={(event) => setSearchText(event.target.value)} />}
          </Field>
          {search.length >= 2 ? (
            <fieldset className="grid gap-1">
              <legend className="sr-only">{t("assets.assignSheet.results")}</legend>
              {!usersQuery.isLoading && users.length === 0 ? <p className={hintClassName}>{t("assets.assignSheet.noUsers")}</p> : null}
              {users.map((user) => (
                <label
                  key={user.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-[12.5px] has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                >
                  <input type="radio" name="asset-signatory-user" value={user.id} checked={userId === user.id} onChange={() => setUserId(user.id)} />
                  <span className="min-w-0">
                    <span className="block truncate text-foreground">{user.displayName}</span>
                    <span className="block truncate text-[11.5px] text-muted-foreground">{user.email}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          ) : null}
          <Field label={t("assets.transfers.signatories.titleLabel")} hint={t("assets.transfers.signatories.titleHint")}>
            {(control) => <Input {...control} maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} />}
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
            <Button type="submit" variant="primary" disabled={pending || userId === ""}>
              {pending ? t("ui.loading") : t("assets.transfers.signatories.save")}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
