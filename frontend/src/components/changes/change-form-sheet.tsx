import { ChangeFormSecondaryFields } from "./change-form-secondary-fields";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { errorTextClassName } from "@/components/ui/control";
import { ChangeFormOptionsHint } from "@/components/changes/change-form-options-hint";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { buildChangeConflictPreview } from "@/lib/changes/change-conflict-preview";
import {
  canSubmitChangeForm,
  changeFormBody,
  changeFormUnits,
  changeWindowState,
} from "@/lib/changes/change-form-body";
import { useChangeCabGroup } from "@/lib/changes/use-change-cab-group";
import { useChangeOwnerSearch } from "@/lib/changes/use-change-owner-search";
import {
  changeLevelKeys,
  changeRiskKeys,
  changeRiskTone,
  changeTypeKeys,
  computeChangeRisk,
  mapChangeError,
} from "@/lib/changes/change-view";
import { mapApiError } from "@/lib/map-api-error";
import {
  changeFormDescriptionKey,
  changeFormSubmitLabelKey,
} from "@/lib/changes/change-form-labels";
import { useChangeConflictsPreview } from "@/lib/changes/use-change-conflicts-preview";
import { fromDateTimeLocalValue, toDateTimeLocalValue } from "@/lib/on-call/on-call-view";
import {
  changeLevels,
  changeTypes,
  createChange,
  updateChange,
  type ChangeAssetOption,
  type ChangeCapabilities,
  type ChangeDetail,
  type ChangeLevel,
  type ChangeOptions,
  type ChangeProblemOption,
  type ChangeType,
} from "@/services/changes-api";

const textMax = 8000;

type Owner = { readonly id: string; readonly displayName: string; readonly email?: string };

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
  readonly change?: ChangeDetail;
  readonly prefill?: ChangeFormPrefill;
  readonly onSaved: (changeId: string) => void;
}

export function ChangeFormSheet({
  open,
  onOpenChange,
  options,
  capabilities,
  change,
  prefill,
  onSaved,
}: ChangeFormSheetProperties) {
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
  const cabGroup = useChangeCabGroup({ options, change, unitId });
  const prefillCabGroup = cabGroup.prefill;
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const ownerSearch = useChangeOwnerSearch({
    open,
    canAssignOwner,
    organizationalUnitId: unitId,
    hasOwner: owner !== null,
  });
  const resetOwnerSearch = ownerSearch.reset;

  useEffect(() => {
    if (!open) return;
    setType(change?.type ?? "NORMAL");
    setTemplateId(change?.template?.id ?? "");
    setTitle(change?.title ?? prefill?.title ?? "");
    setDescription(change?.description ?? prefill?.description ?? "");
    setReason(change?.reason ?? "");
    setImpact(change?.impact ?? "MEDIUM");
    setLikelihood(change?.likelihood ?? "MEDIUM");
    const nextUnitId =
      change?.organizationalUnit.id ??
      options.homeOrganizationalUnitId ??
      options.units[0]?.id ??
      "";
    setUnitId(nextUnitId);
    prefillCabGroup(nextUnitId);
    setServiceIds(
      change ? change.services.map((service) => service.id) : [...(prefill?.serviceIds ?? [])],
    );
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
    resetOwnerSearch();
    setError(null);
  }, [open, change, prefill, options, resetOwnerSearch, prefillCabGroup]);

  // W7.66: moving the unit drops the picked owner — it may not manage the new one.
  const changeUnit = (nextUnitId: string) => {
    if (nextUnitId === unitId) return;
    setUnitId(nextUnitId);
    setOwner(null);
    resetOwnerSearch();
    cabGroup.applyUnitMove(nextUnitId);
  };

  const standard = type === "STANDARD";
  const template = options.templates.find((item) => item.id === templateId);
  const chooseTemplate = (id: string) => {
    setTemplateId(id);
    const next = options.templates.find((item) => item.id === id);
    if (next === undefined) return;
    setImpact(next.impact);
    setLikelihood(next.likelihood);
    setCausesDowntime(next.causesDowntime);
    if (title.trim() === "") setTitle(next.name.slice(0, 200));
  };

  const risk = standard && template ? template.risk : computeChangeRisk(impact, likelihood);
  const startIso = start === "" ? null : fromDateTimeLocalValue(start);
  const endIso = end === "" ? null : fromDateTimeLocalValue(end);
  const { invalid: windowInvalid, half: windowHalf } = changeWindowState(
    start,
    end,
    startIso,
    endIso,
  );

  const previewInput = buildChangeConflictPreview({
    open,
    type,
    plannedStart: startIso,
    plannedEnd: endIso,
    serviceIds,
    assetIds: assets.map((asset) => asset.id),
    changeId: change?.id,
  });
  const { query: conflictsPreview, hasPreview } = useChangeConflictsPreview(previewInput);

  const units = changeFormUnits(options, change);

  const canSubmit = canSubmitChangeForm({
    saving,
    windowInvalid,
    windowHalf,
    windowOnly,
    title,
    unitId,
    standard,
    editing: change !== undefined && editing,
    templateId,
    description,
    cabGroupId: cabGroup.value,
  });

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
        saved = await updateChange(change.id, {
          version: change.version,
          ...windowPart,
          ...ownerPart,
        });
      } else {
        const body = changeFormBody({
          title,
          description,
          reason,
          organizationalUnitId: unitId,
          serviceIds,
          ...(capabilities.cmdbEnabled ? { assetIds: assets.map((asset) => asset.id) } : {}),
          ...(capabilities.problemsEnabled ? { problemId: problem?.id ?? null } : {}),
          causesDowntime,
          plannedStart: startIso,
          plannedEnd: endIso,
          ...ownerPart,
          standard,
          impact,
          likelihood,
          cabGroupId: cabGroup.value,
          implementationPlan,
          backoutPlan,
          testPlan,
          communicationPlan,
        });
        saved = editing
          ? await updateChange(change.id, { version: change.version, ...body })
          : await createChange({ type, ...body, ...(standard ? { templateId } : {}) });
      }
      onOpenChange(false);
      onSaved(saved.id);
    } catch (caught) {
      const message = t(mapChangeError(caught) ?? mapApiError(caught));
      setError(message);
      // The sheet scrolls, so the failure is announced, not only printed inline.
      toast({ tone: "danger", title: message });
    } finally {
      setSaving(false);
    }
  };

  const levelOptions = changeLevels.map((value) => (
    <option key={value} value={value}>
      {t(changeLevelKeys[value])}
    </option>
  ));

  return (
    <Sheet open={open} onOpenChange={(next) => (saving ? undefined : onOpenChange(next))}>
      <SheetContent
        side="right"
        className="flex w-full max-w-xl flex-col overflow-y-auto p-5"
        data-testid="change-form-sheet"
      >
        <SheetTitle>
          {editing ? t("changes.form.editTitle") : t("changes.form.createTitle")}
        </SheetTitle>
        <SheetDescription className="mt-1 text-[12px] text-muted-foreground">
          {t(changeFormDescriptionKey({ windowOnly, editing }))}
        </SheetDescription>
        <ChangeFormOptionsHint options={options} />
        <form className="mt-4 grid gap-3" onSubmit={(event) => void submit(event)} noValidate>
          {!editing ? (
            <Field
              label={t("changes.fields.type")}
              required
              hint={t(`changes.form.typeHint.${type}`)}
            >
              {(control) => (
                <Select
                  {...control}
                  value={type}
                  onChange={(event) => setType(event.target.value as ChangeType)}
                  data-testid="change-form-type"
                >
                  {changeTypes.map((value) => (
                    <option
                      key={value}
                      value={value}
                      disabled={value === "STANDARD" && options.templates.length === 0}
                    >
                      {t(changeTypeKeys[value])}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ) : null}
          {standard && !editing ? (
            <Field
              label={t("changes.fields.template")}
              required
              hint={t("changes.form.templateHint")}
            >
              {(control) => (
                <Select
                  {...control}
                  value={templateId}
                  onChange={(event) => chooseTemplate(event.target.value)}
                  data-testid="change-form-template"
                >
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
            {(control) => (
              <Input
                {...control}
                value={title}
                maxLength={200}
                disabled={windowOnly}
                onChange={(event) => setTitle(event.target.value)}
                autoFocus={!editing}
              />
            )}
          </Field>
          <Field
            label={t("changes.fields.description")}
            required={!standard}
            hint={standard ? t("changes.form.descriptionStandardHint") : undefined}
          >
            {(control) => (
              <Textarea
                {...control}
                rows={4}
                value={description}
                maxLength={textMax}
                disabled={windowOnly}
                onChange={(event) => setDescription(event.target.value)}
              />
            )}
          </Field>
          <Field label={t("changes.fields.reason")} hint={t("changes.form.reasonHint")}>
            {(control) => (
              <Textarea
                {...control}
                rows={2}
                value={reason}
                maxLength={4000}
                disabled={windowOnly}
                onChange={(event) => setReason(event.target.value)}
              />
            )}
          </Field>
          {!standard ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("changes.fields.impact")}>
                {(control) => (
                  <Select
                    {...control}
                    value={impact}
                    disabled={windowOnly}
                    onChange={(event) => setImpact(event.target.value as ChangeLevel)}
                  >
                    {levelOptions}
                  </Select>
                )}
              </Field>
              <Field label={t("changes.fields.likelihood")}>
                {(control) => (
                  <Select
                    {...control}
                    value={likelihood}
                    disabled={windowOnly}
                    onChange={(event) => setLikelihood(event.target.value as ChangeLevel)}
                  >
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
              <Select
                {...control}
                value={unitId}
                disabled={windowOnly}
                onChange={(event) => changeUnit(event.target.value)}
              >
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.path}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <ChangeFormSecondaryFields
            options={options}
            capabilities={capabilities}
            change={change}
            type={type}
            standard={standard}
            locked={windowOnly}
            serviceIds={serviceIds}
            setServiceIds={setServiceIds}
            assets={assets}
            setAssets={setAssets}
            problem={problem}
            setProblem={setProblem}
            cabGroupId={cabGroup.value}
            setCabGroupId={cabGroup.setValue}
            cabGroupOptions={cabGroup.candidates}
            cabGroupRequired={cabGroup.required}
            start={start}
            setStart={setStart}
            end={end}
            setEnd={setEnd}
            windowInvalid={windowInvalid}
            windowHalf={windowHalf}
            hasPreview={hasPreview}
            conflicts={conflictsPreview.data}
            causesDowntime={causesDowntime}
            setCausesDowntime={setCausesDowntime}
            canAssignOwner={canAssignOwner}
            owner={owner}
            setOwner={setOwner}
            ownerSearch={ownerSearch.search}
            setOwnerSearch={ownerSearch.setSearch}
            owners={ownerSearch.items}
            ownersLoading={ownerSearch.loading}
            implementationPlan={implementationPlan}
            setImplementationPlan={setImplementationPlan}
            backoutPlan={backoutPlan}
            setBackoutPlan={setBackoutPlan}
            testPlan={testPlan}
            setTestPlan={setTestPlan}
            communicationPlan={communicationPlan}
            setCommunicationPlan={setCommunicationPlan}
          />
          {error !== null ? (
            <p role="alert" className={errorTextClassName}>
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              {t("ui.cancel")}
            </Button>
            <Button type="submit" disabled={!canSubmit} data-testid="change-form-submit">
              {t(changeFormSubmitLabelKey({ saving, editing }))}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
