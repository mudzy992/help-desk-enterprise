import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { FileDown, FileUp, FlaskConical, Pencil, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { errorTextClassName, hintClassName, tableHeadClassName, tableRowClassName, tableWrapClassName } from "@/components/ui/control";
import { Field, Input } from "@/components/ui/field";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { formatAssetDateTime, mapAssetError } from "@/lib/assets/asset-view";
import { mapApiError } from "@/lib/map-api-error";
import { ApiError } from "@/services/api";
import {
  assetTransferQueryKeys,
  downloadTransferTemplate,
  getAssetSignatories,
  listTransferTemplates,
  removeAssetSignatory,
  saveAssetSignatory,
  uploadTransferTemplate,
  type AssetSignatoryUnit,
} from "@/services/asset-transfers-api";
import { searchAssetUsers } from "@/services/assets-api";

/**
 * Paket 3.2 C9 (§7a.2, §7a.4): catalog settings of transfer records —
 * signatories per organizational unit (inherited down the tree) and the
 * DOCX template versions. Admins with asset.type.manage only.
 */
export function AssetTransferSettingsCard() {
  return (
    <>
      <SignatoriesCard />
      <TemplatesCard />
    </>
  );
}

function SignatoriesCard() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<AssetSignatoryUnit | null>(null);
  const query = useQuery({ queryKey: assetTransferQueryKeys.signatories, queryFn: getAssetSignatories, retry: false });
  const units = query.data?.units ?? [];
  const names = new Map(units.map((unit) => [unit.id, unit.name]));

  async function remove(unit: AssetSignatoryUnit) {
    try {
      await removeAssetSignatory(unit.id);
      await queryClient.invalidateQueries({ queryKey: assetTransferQueryKeys.signatories });
      toast({ tone: "success", title: t("assets.transfers.signatories.removed", { unit: unit.name }) });
    } catch (caught) {
      toast({ tone: "danger", title: t("assets.transfers.actionFailed"), description: t(mapAssetError(caught) ?? mapApiError(caught)) });
    }
  }

  return (
    <Card>
      <CardHeader title={t("assets.transfers.signatories.title")} subtitle={t("assets.transfers.signatories.subtitle")} />
      <div className="grid gap-2 p-4">
        {query.data?.defaultSignatory ? (
          <p className={hintClassName}>{t("assets.transfers.signatories.defaultIs", { name: query.data.defaultSignatory.displayName })}</p>
        ) : (
          <p className={hintClassName}>{t("assets.transfers.signatories.noDefault")}</p>
        )}
        {query.isLoading ? <p className={hintClassName}>{t("ui.loading")}</p> : null}
        {query.error ? (
          <p role="alert" className={errorTextClassName}>
            {t(mapAssetError(query.error) ?? mapApiError(query.error))}
          </p>
        ) : null}
        {units.length > 0 ? (
          <div className={tableWrapClassName}>
            <table className="w-full text-[12.5px]">
              <thead>
                <tr>
                  <th scope="col" className={tableHeadClassName}>{t("assets.transfers.signatories.unit")}</th>
                  <th scope="col" className={tableHeadClassName}>{t("assets.transfers.signatories.own")}</th>
                  <th scope="col" className={tableHeadClassName}>{t("assets.transfers.signatories.effective")}</th>
                  <th scope="col" className={tableHeadClassName}>
                    <span className="sr-only">{t("assets.transfers.signatories.actions")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {units.map((unit) => (
                  <tr key={unit.id} className={tableRowClassName}>
                    <td className="px-3 py-2 text-foreground" style={{ paddingLeft: `${0.75 + Math.max(unit.depth, 0) * 1}rem` }}>
                      {unit.name}
                    </td>
                    <td className="px-3 py-2">
                      {unit.own ? (
                        <span className="text-foreground">
                          {unit.own.displayName}
                          {unit.own.title ? <span className="text-muted-foreground"> · {unit.own.title}</span> : null}
                          {!unit.own.isActive ? (
                            <Badge tone="warning" className="ml-2">
                              {t("assets.transfers.signatories.inactive")}
                            </Badge>
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {unit.effective.displayName ?? t("assets.transfers.noSignatory")}
                      {unit.effective.inheritedFromUnitId
                        ? ` (${t("assets.transfers.signatories.inheritedFrom", { unit: names.get(unit.effective.inheritedFromUnitId) ?? "—" })})`
                        : unit.effective.source === "default"
                          ? ` (${t("assets.transfers.signatories.fromDefault")})`
                          : ""}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-1">
                        <Button type="button" size="xs" variant="ghost" onClick={() => setEditing(unit)} aria-label={t("assets.transfers.signatories.editFor", { unit: unit.name })}>
                          <Pencil size={13} aria-hidden="true" />
                        </Button>
                        {unit.own ? (
                          <Button type="button" size="xs" variant="ghost" onClick={() => void remove(unit)} aria-label={t("assets.transfers.signatories.removeFor", { unit: unit.name })}>
                            <X size={13} aria-hidden="true" />
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
      <SignatorySheet unit={editing} onOpenChange={(open) => (open ? undefined : setEditing(null))} />
    </Card>
  );
}

function SignatorySheet({ unit, onOpenChange }: { readonly unit: AssetSignatoryUnit | null; readonly onOpenChange: (open: boolean) => void }) {
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

function TemplatesCard() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [problems, setProblems] = useState<string | null>(null);
  const query = useQuery({ queryKey: assetTransferQueryKeys.templates, queryFn: listTransferTemplates, retry: false });
  const templates = query.data ?? [];

  async function download(version: number | "default" | "sample", locale?: string) {
    try {
      await downloadTransferTemplate(version, locale);
    } catch (caught) {
      toast({ tone: "danger", title: t("assets.transfers.downloadFailed"), description: t(mapAssetError(caught) ?? mapApiError(caught)) });
    }
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    setPending(true);
    setProblems(null);
    try {
      const result = await uploadTransferTemplate(file, notes.trim());
      await queryClient.invalidateQueries({ queryKey: assetTransferQueryKeys.templates });
      setNotes("");
      toast({
        tone: result.unknownTags.length > 0 ? "warning" : "success",
        title: t("assets.transfers.templates.uploaded", { version: result.version }),
        description: result.unknownTags.length > 0 ? t("assets.transfers.templates.unknownTags", { tags: result.unknownTags.join(", ") }) : undefined,
      });
    } catch (caught) {
      const detail = caught instanceof ApiError && caught.code === "ASSET_TRANSFER_TEMPLATE_INVALID" && caught.message !== caught.code ? caught.message : null;
      setProblems(detail ? t("assets.transfers.templates.invalidDetail", { detail }) : t(mapAssetError(caught) ?? mapApiError(caught)));
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title={t("assets.transfers.templates.title")}
        subtitle={t("assets.transfers.templates.subtitle")}
        actions={
          <Button type="button" size="sm" variant="outline" onClick={() => void download("sample")}>
            <FlaskConical size={14} aria-hidden="true" />
            {t("assets.transfers.templates.sample")}
          </Button>
        }
      />
      <div className="grid gap-3 p-4">
        <p className={hintClassName}>{t("assets.transfers.templates.placeholdersHint")}</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => void download("default", "bs")}>
            <FileDown size={14} aria-hidden="true" />
            {t("assets.transfers.templates.defaultBs")}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => void download("default", "en")}>
            <FileDown size={14} aria-hidden="true" />
            {t("assets.transfers.templates.defaultEn")}
          </Button>
        </div>
        <div className="grid gap-2 md:grid-cols-[1fr_auto] md:items-end">
          <Field label={t("assets.transfers.templates.notes")}>
            {(control) => <Input {...control} maxLength={500} value={notes} onChange={(event) => setNotes(event.target.value)} />}
          </Field>
          <div>
            <input
              ref={fileInput}
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(event) => {
                void upload(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <Button type="button" variant="primary" disabled={pending} onClick={() => fileInput.current?.click()}>
              <FileUp size={14} aria-hidden="true" />
              {pending ? t("ui.loading") : t("assets.transfers.templates.upload")}
            </Button>
          </div>
        </div>
        {problems ? (
          <p role="alert" className={errorTextClassName}>
            {problems}
          </p>
        ) : null}
        {templates.length === 0 && !query.isLoading ? <p className={hintClassName}>{t("assets.transfers.templates.usingDefault")}</p> : null}
        {templates.length > 0 ? (
          <ul className="grid gap-1.5 text-[12.5px]">
            {templates.map((template) => (
              <li key={template.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2">
                <span className="font-semibold text-foreground">v{template.version}</span>
                <span className="truncate text-foreground">{template.fileName}</span>
                {template.isActive ? <Badge tone="success">{t("assets.transfers.templates.active")}</Badge> : null}
                <span className="text-[11.5px] text-muted-foreground">{formatAssetDateTime(template.createdAt, i18n.language)}</span>
                {template.notes ? <span className="truncate text-[11.5px] text-muted-foreground">· {template.notes}</span> : null}
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  className="ml-auto"
                  onClick={() => void download(template.version)}
                  aria-label={t("assets.transfers.templates.downloadVersion", { version: template.version })}
                >
                  <FileDown size={13} aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Card>
  );
}
