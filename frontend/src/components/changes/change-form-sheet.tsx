import { useEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ChangeConflictsList } from "@/components/changes/change-conflicts-list";
import { ChangeAssetPicker, ChangeProblemPicker } from "@/components/changes/change-link-pickers";
import { ChangeServicePicker } from "@/components/changes/change-service-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { errorTextClassName, hintClassName } from "@/components/ui/control";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { changeLevelKeys, changeRiskKeys, changeRiskTone, changeTypeKeys, computeChangeRisk, mapChangeError } from "@/lib/changes/change-view";
import { mapApiError } from "@/lib/map-api-error";
import { fromDateTimeLocalValue, toDateTimeLocalValue } from "@/lib/on-call/on-call-view";
import {
  changeExtraKeys,
  changeLevels,
  changeQueryKeys,
  changeTypes,
  createChange,
  previewChangeConflicts,
  searchChangeOwners,
  updateChange,
  type ChangeAssetOption,
  type ChangeCapabilities,
  type ChangeConflictPreviewInput,
  type ChangeDetail,
  type ChangeLevel,
  type ChangeOptions,
  type ChangeProblemOption,
  type ChangeType,
} from "@/services/changes-api";

type Owner = { readonly id: string; readonly displayName: string; readonly email?: string };

/** Optional prefill when the form is opened from another record (e.g. a problem, C4). */
export type ChangeFormPrefill = {
  readonly title?: string;
  readonly description?: string;
  readonly serviceIds?: readonly string[];
  readonly problem?: ChangeProblemOption;
  readonly assets?: readonly ChangeAssetOption[];
};

interface ChangeFormSheetProperties {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly options: ChangeOptions;
  readonly capabilities: ChangeCapabilities;
  /** Editing when set; creating otherwise. */
  readonly change?: ChangeDetail;
  readonly prefill?: ChangeFormPrefill;
  readonly onSaved: (changeId: string) => void;
}

const textMax = 8000;

/**
 * Paket 3.4 (§6, §17): create a change or edit it. A standard change starts
 * from a template (plans, impact and likelihood come from it). In SCHEDULED
 * only the window and the owner can change (`editScope = "window"`).
 */
export function ChangeFormSheet({ open, onOpenChange, options, capabilities, change, prefill, onSaved }: ChangeFormSheetProperties) {
  const { t } = useTranslation();
  const editing = change !== undefined;
  const windowOnly = change?.permissions.editScope === "window";
  const canAssignOwner = capabilities.canManage;
  const [type, setType] = useState<ChangeType>("NORMAL");
  const [templateId, setTemplateId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [reason, setReason] = useState("");
  const [impact, setImpact] = useState<ChangeLevel>("MEDIUM");
  const [likelihood, setLikelihood] = useState<ChangeLevel>("MEDIUM");
  const [unitId, setUnitId] = useState("");
  const [cabGroupId, setCabGroupId] = useState("");
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [causesDowntime, setCausesDowntime] = useState(false);
  const [implementationPlan, setImplementationPlan] = useState("");
  const [backoutPlan, setBackoutPlan] = useState("");
  const [testPlan, setTestPlan] = useState("");
  const [communicationPlan, setCommunicationPlan] = useState("");
  const [assets, setAssets] = useState<ChangeAssetOption[]>([]);
  const [problem, setProblem] = useState<ChangeProblemOption | null>(null);
  const [owner, setOwner] = useState<Owner | null>(null);
  const [ownerSearch, setOwnerSearch] = useState("");
  const [ownerDebounced, setOwnerDebounced] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setType(change?.type ?? "NORMAL");
    setTemplateId(change?.template?.id ?? "");
    setTitle(change?.title ?? prefill?.title ?? "");
    setDescription(change?.description ?? prefill?.description ?? "");
    setReason(change?.reason ?? "");
    setImpact(change?.impact ?? "MEDIUM");
    setLikelihood(change?.likelihood ?? "MEDIUM");
    setUnitId(change?.organizationalUnit.id ?? options.homeOrganizationalUnitId ?? options.units[0]?.id ?? "");
    setCabGroupId(change?.cabGroup?.id ?? options.cabGroups[0]?.id ?? "");
    setServiceIds(change ? change.services.map((service) => service.id) : [...(prefill?.serviceIds ?? [])]);
    setStart(change?.plannedStart ? toDateTimeLocalValue(change.plannedStart) : "");
    setEnd(change?.plannedEnd ? toDateTimeLocalValue(change.plannedEnd) : "");
    setCausesDowntime(change?.causesDowntime ?? false);
    setImplementationPlan(change?.implementationPlan ?? "");
    setBackoutPlan(change?.backoutPlan ?? "");
    setTestPlan(change?.testPlan ?? "");
    setCommunicationPlan(change?.communicationPlan ?? "");
    setAssets(change ? [...change.assets] : [...(prefill?.assets ?? [])]);
    setProblem(change ? change.problem : (prefill?.problem ?? null));
    setOwner(change?.owner ?? null);
    setOwnerSearch("");
    setError(null);
  }, [open, change, prefill, options]);

  useEffect(() => {
    const handle = window.setTimeout(() => setOwnerDebounced(ownerSearch.trim()), 250);
    return () => window.clearTimeout(handle);
  }, [ownerSearch]);

  const owners = useQuery({
    queryKey: changeQueryKeys.owners(ownerDebounced),
    queryFn: () => searchChangeOwners(ownerDebounced),
    enabled: open && canAssignOwner && owner === null,
    retry: false,
  });

  const standard = type === "STANDARD";
  const template = options.templates.find((item) => item.id === templateId);
  const chooseTemplate = (id: string) => {
    setTemplateId(id);
    const next = options.templates.find((item) => item.id === id);
    if (next === undefined) return;
    // §13: the template decides impact, likelihood and the downtime default.
    setImpact(next.impact);
    setLikelihood(next.likelihood);
    setCausesDowntime(next.causesDowntime);
    if (title.trim() === "") setTitle(next.name.slice(0, 200));
  };

  const risk = standard && template ? template.risk : computeChangeRisk(impact, likelihood);
  const startIso = start === "" ? null : fromDateTimeLocalValue(start);
  const endIso = end === "" ? null : fromDateTimeLocalValue(end);
  const windowInvalid = (start !== "" && startIso === null) || (end !== "" && endIso === null) || (startIso !== null && endIso !== null && startIso >= endIso);
  const windowHalf = (startIso === null) !== (endIso === null);

  // §9 / §17: live conflicts while the window is chosen (debounced).
  const previewInput: ChangeConflictPreviewInput | null =
    open && startIso !== null && endIso !== null && !windowInvalid
      ? { type, plannedStart: startIso, plannedEnd: endIso, serviceIds, assetIds: assets.map((asset) => asset.id), ...(change ? { changeId: change.id } : {}) }
      : null;
  const [debouncedPreview, setDebouncedPreview] = useState<ChangeConflictPreviewInput | null>(null);
  const previewKey = previewInput === null ? "" : JSON.stringify(previewInput);
  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedPreview(previewKey === "" ? null : (JSON.parse(previewKey) as ChangeConflictPreviewInput)), 400);
    return () => window.clearTimeout(handle);
  }, [previewKey]);
  const conflictsPreview = useQuery({
    queryKey: changeExtraKeys.preview(debouncedPreview ?? { type, plannedStart: "", plannedEnd: "" }),
    queryFn: () => previewChangeConflicts(debouncedPreview as ChangeConflictPreviewInput),
    enabled: debouncedPreview !== null,
    retry: false,
  });

  const units =
    change !== undefined && !options.units.some((unit) => unit.id === change.organizationalUnit.id)
      ? [{ id: change.organizationalUnit.id, name: change.organizationalUnit.name, path: change.organizationalUnit.ouPath }, ...options.units]
      : options.units;

  const canSubmit =
    !saving &&
    !windowInvalid &&
    !windowHalf &&
    (windowOnly ||
      (title.trim().length >= 3 &&
        unitId !== "" &&
        (standard ? editing || templateId !== "" : description.trim().length > 0)));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const ownerPart = canAssignOwner ? { ownerUserId: owner?.id ?? null } : {};
      const windowPart = { plannedStart: startIso, plannedEnd: endIso };
      let saved: ChangeDetail;
      if (editing && windowOnly) {
        saved = await updateChange(change.id, { version: change.version, ...windowPart, ...ownerPart });
      } else {
        const body = {
          title: title.trim(),
          description: description.trim(),
          reason: reason.trim(),
          organizationalUnitId: unitId,
          serviceIds,
          ...(capabilities.cmdbEnabled ? { assetIds: assets.map((asset) => asset.id) } : {}),
          ...(capabilities.problemsEnabled ? { problemId: problem?.id ?? null } : {}),
          causesDowntime,
          ...windowPart,
          ...ownerPart,
          ...(standard
            ? {}
            : {
                impact,
                likelihood,
                cabGroupId: cabGroupId || null,
                implementationPlan: implementationPlan.trim() || null,
                backoutPlan: backoutPlan.trim() || null,
                testPlan: testPlan.trim() || null,
              }),
          communicationPlan: communicationPlan.trim() || null,
        };
        saved = editing
          ? await updateChange(change.id, { version: change.version, ...body })
          : await createChange({ type, ...body, ...(standard ? { templateId } : {}) });
      }
      onOpenChange(false);
      onSaved(saved.id);
    } catch (caught) {
      setError(t(mapChangeError(caught) ?? mapApiError(caught)));
    } finally {
      setSaving(false);
    }
  };

  const levelOptions = changeLevels.map((value) => (
    <option key={value} value={value}>
      {t(changeLevelKeys[value])}
    </option>
  ));
  const locked = windowOnly;

  return (
    <Sheet open={open} onOpenChange={(next) => (saving ? undefined : onOpenChange(next))}>
      <SheetContent side="right" className="flex w-full max-w-xl flex-col overflow-y-auto p-5" data-testid="change-form-sheet">
        <SheetTitle>{editing ? t("changes.form.editTitle") : t("changes.form.createTitle")}</SheetTitle>
        <SheetDescription className="mt-1 text-[12px] text-muted-foreground">
          {windowOnly ? t("changes.form.windowOnlyDescription") : editing ? t("changes.form.editDescription") : t("changes.form.createDescription")}
        </SheetDescription>
        <form className="mt-4 grid gap-3" onSubmit={(event) => void submit(event)} noValidate>
          {!editing ? (
            <Field label={t("changes.fields.type")} required hint={t(`changes.form.typeHint.${type}`)}>
              {(control) => (
                <Select {...control} value={type} onChange={(event) => setType(event.target.value as ChangeType)} data-testid="change-form-type">
                  {changeTypes.map((value) => (
                    <option key={value} value={value} disabled={value === "STANDARD" && options.templates.length === 0}>
                      {t(changeTypeKeys[value])}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ) : null}
          {standard && !editing ? (
            <Field label={t("changes.fields.template")} required hint={t("changes.form.templateHint")}>
              {(control) => (
                <Select {...control} value={templateId} onChange={(event) => chooseTemplate(event.target.value)} data-testid="change-form-template">
                  <option value="">{t("changes.form.templatePlaceholder")}</option>
                  {options.templates.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ) : null}
          <Field label={t("changes.fields.title")} required>
            {(control) => <Input {...control} value={title} maxLength={200} disabled={locked} onChange={(event) => setTitle(event.target.value)} autoFocus={!editing} />}
          </Field>
          <Field label={t("changes.fields.description")} required={!standard} hint={standard ? t("changes.form.descriptionStandardHint") : undefined}>
            {(control) => <Textarea {...control} rows={4} value={description} maxLength={textMax} disabled={locked} onChange={(event) => setDescription(event.target.value)} />}
          </Field>
          <Field label={t("changes.fields.reason")} hint={t("changes.form.reasonHint")}>
            {(control) => <Textarea {...control} rows={2} value={reason} maxLength={4000} disabled={locked} onChange={(event) => setReason(event.target.value)} />}
          </Field>
          {!standard ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("changes.fields.impact")}>
                {(control) => (
                  <Select {...control} value={impact} disabled={locked} onChange={(event) => setImpact(event.target.value as ChangeLevel)}>
                    {levelOptions}
                  </Select>
                )}
              </Field>
              <Field label={t("changes.fields.likelihood")}>
                {(control) => (
                  <Select {...control} value={likelihood} disabled={locked} onChange={(event) => setLikelihood(event.target.value as ChangeLevel)}>
                    {levelOptions}
                  </Select>
                )}
              </Field>
            </div>
          ) : null}
          <p className="flex items-center gap-2 text-[12.5px] text-foreground" aria-live="polite">
            <span className="text-muted-foreground">{t("changes.form.riskPreview")}</span>
            <Badge tone={changeRiskTone(risk)}>{t(changeRiskKeys[risk])}</Badge>
          </p>
          <Field label={t("changes.fields.organizationalUnit")} required>
            {(control) => (
              <Select {...control} value={unitId} disabled={locked} onChange={(event) => setUnitId(event.target.value)}>
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.path}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <ChangeServicePicker
            label={t("changes.fields.services")}
            options={options.services}
            value={serviceIds}
            onChange={setServiceIds}
            disabled={locked}
            hint={standard ? t("changes.form.servicesStandardHint") : t("changes.form.servicesHint")}
          />
          {capabilities.cmdbEnabled ? <ChangeAssetPicker value={assets} onChange={setAssets} disabled={locked} /> : null}
          {capabilities.problemsEnabled ? <ChangeProblemPicker value={problem} onChange={setProblem} disabled={locked} /> : null}
          {!standard ? (
            <Field label={t("changes.fields.cabGroup")} hint={t("changes.form.cabGroupHint")}>
              {(control) => (
                <Select {...control} value={cabGroupId} disabled={locked} onChange={(event) => setCabGroupId(event.target.value)}>
                  {change?.cabGroup && !options.cabGroups.some((group) => group.id === change.cabGroup?.id) ? (
                    <option value={change.cabGroup.id}>{change.cabGroup.name}</option>
                  ) : null}
                  {options.cabGroups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ) : null}
          <fieldset className="grid gap-2">
            <legend className="mb-1.5 text-[12.5px] font-medium text-foreground">{t("changes.form.window")}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("changes.fields.plannedStart")}>
                {(control) => <Input {...control} type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} data-testid="change-form-start" />}
              </Field>
              <Field label={t("changes.fields.plannedEnd")}>
                {(control) => <Input {...control} type="datetime-local" value={end} onChange={(event) => setEnd(event.target.value)} data-testid="change-form-end" />}
              </Field>
            </div>
            {windowInvalid ? (
              <p role="alert" className={errorTextClassName}>
                {t("changes.errors.windowInvalid")}
              </p>
            ) : windowHalf ? (
              <p className={hintClassName}>{t("changes.form.windowBoth")}</p>
            ) : (
              <p className={hintClassName}>
                {options.minLeadTimeHours > 0 && type === "NORMAL"
                  ? t("changes.form.windowLeadHint", { hours: options.minLeadTimeHours })
                  : t("changes.form.windowHint")}
              </p>
            )}
            {debouncedPreview !== null && conflictsPreview.data ? (
              <div className="grid gap-1.5 rounded-md border border-border/70 px-3 py-2" aria-live="polite" data-testid="change-form-conflicts">
                <p className="text-[12px] font-medium text-foreground">{t("changes.conflicts.title")}</p>
                <ChangeConflictsList conflicts={conflictsPreview.data} />
              </div>
            ) : null}
            <Checkbox label={t("changes.fields.causesDowntime")} checked={causesDowntime} disabled={locked} onChange={(event) => setCausesDowntime(event.target.checked)} />
            <p className={hintClassName}>{t("changes.form.causesDowntimeHint")}</p>
          </fieldset>
          {canAssignOwner ? (
            <div className="grid gap-1.5">
              <span className="text-[12.5px] font-medium text-foreground">{t("changes.fields.owner")}</span>
              {owner !== null ? (
                <div className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-[12.5px]">
                  <span className="min-w-0">
                    <span className="block truncate text-foreground">{owner.displayName}</span>
                    {owner.email ? <span className="block truncate text-[11.5px] text-muted-foreground">{owner.email}</span> : null}
                  </span>
                  <Button type="button" variant="ghost" size="icon" aria-label={t("changes.form.clearOwner")} onClick={() => setOwner(null)}>
                    <X size={13} aria-hidden="true" />
                  </Button>
                </div>
              ) : (
                <>
                  <Input
                    value={ownerSearch}
                    maxLength={120}
                    onChange={(event) => setOwnerSearch(event.target.value)}
                    placeholder={t("changes.form.ownerSearch")}
                    aria-label={t("changes.form.ownerSearch")}
                  />
                  <ul className="grid max-h-40 gap-0.5 overflow-y-auto rounded-md border border-border p-1" aria-label={t("changes.form.ownerResults")}>
                    {(owners.data?.items ?? []).length === 0 ? (
                      <li className={`px-2 py-1 ${hintClassName}`}>{owners.isFetching ? t("ui.loading") : t("changes.form.ownerNone")}</li>
                    ) : (
                      (owners.data?.items ?? []).map((item) => (
                        <li key={item.id}>
                          <button
                            type="button"
                            className="w-full truncate rounded-md px-2 py-1 text-left text-[12.5px] text-foreground hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                            onClick={() => {
                              setOwner(item);
                              setOwnerSearch("");
                            }}
                          >
                            {item.displayName}
                            {item.email ? <span className="text-muted-foreground"> · {item.email}</span> : null}
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                </>
              )}
            </div>
          ) : null}
          {!standard ? (
            <>
              <Field label={t("changes.fields.implementationPlan")} hint={t("changes.form.planHint")}>
                {(control) => <Textarea {...control} rows={4} value={implementationPlan} maxLength={textMax} disabled={locked} onChange={(event) => setImplementationPlan(event.target.value)} />}
              </Field>
              <Field label={t("changes.fields.backoutPlan")} hint={t("changes.form.planHint")}>
                {(control) => <Textarea {...control} rows={3} value={backoutPlan} maxLength={textMax} disabled={locked} onChange={(event) => setBackoutPlan(event.target.value)} />}
              </Field>
              <Field label={t("changes.fields.testPlan")} hint={options.requireTestPlan ? t("changes.form.testPlanRequired") : undefined}>
                {(control) => <Textarea {...control} rows={3} value={testPlan} maxLength={textMax} disabled={locked} onChange={(event) => setTestPlan(event.target.value)} />}
              </Field>
            </>
          ) : null}
          <Field label={t("changes.fields.communicationPlan")}>
            {(control) => <Textarea {...control} rows={2} value={communicationPlan} maxLength={textMax} disabled={locked} onChange={(event) => setCommunicationPlan(event.target.value)} />}
          </Field>
          {error !== null ? (
            <p role="alert" className={errorTextClassName}>
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
              {t("ui.cancel")}
            </Button>
            <Button type="submit" disabled={!canSubmit} data-testid="change-form-submit">
              {saving ? t("changes.form.saving") : editing ? t("changes.form.save") : t("changes.form.create")}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
