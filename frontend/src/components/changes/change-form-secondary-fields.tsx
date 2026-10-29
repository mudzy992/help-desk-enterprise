import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ChangeConflictsList } from "./change-conflicts-list";
import { ChangeAssetPicker, ChangeProblemPicker } from "./change-link-pickers";
import { ChangeServicePicker } from "./change-service-picker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { errorTextClassName, hintClassName } from "@/components/ui/control";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import type {
  ChangeAssetOption,
  ChangeCapabilities,
  ChangeConflicts,
  ChangeDetail,
  ChangeOptions,
  ChangeProblemOption,
  ChangeType,
} from "@/services/changes-api";

const textMax = 8000;
type Owner = { readonly id: string; readonly displayName: string; readonly email?: string };

export function ChangeFormSecondaryFields(props: {
  readonly options: ChangeOptions;
  readonly capabilities: ChangeCapabilities;
  readonly change?: ChangeDetail;
  readonly type: ChangeType;
  readonly standard: boolean;
  readonly locked: boolean;
  readonly serviceIds: string[];
  readonly setServiceIds: (value: string[]) => void;
  readonly assets: ChangeAssetOption[];
  readonly setAssets: (value: ChangeAssetOption[]) => void;
  readonly problem: ChangeProblemOption | null;
  readonly setProblem: (value: ChangeProblemOption | null) => void;
  readonly cabGroupId: string;
  readonly setCabGroupId: (value: string) => void;
  readonly start: string;
  readonly setStart: (value: string) => void;
  readonly end: string;
  readonly setEnd: (value: string) => void;
  readonly windowInvalid: boolean;
  readonly windowHalf: boolean;
  readonly hasPreview: boolean;
  readonly conflicts: ChangeConflicts | undefined;
  readonly causesDowntime: boolean;
  readonly setCausesDowntime: (value: boolean) => void;
  readonly canAssignOwner: boolean;
  readonly owner: Owner | null;
  readonly setOwner: (value: Owner | null) => void;
  readonly ownerSearch: string;
  readonly setOwnerSearch: (value: string) => void;
  readonly owners: readonly Owner[];
  readonly ownersLoading: boolean;
  readonly implementationPlan: string;
  readonly setImplementationPlan: (value: string) => void;
  readonly backoutPlan: string;
  readonly setBackoutPlan: (value: string) => void;
  readonly testPlan: string;
  readonly setTestPlan: (value: string) => void;
  readonly communicationPlan: string;
  readonly setCommunicationPlan: (value: string) => void;
}) {
  const { t } = useTranslation();
  const {
    options,
    capabilities,
    change,
    type,
    standard,
    locked,
    serviceIds,
    setServiceIds,
    assets,
    setAssets,
    problem,
    setProblem,
    cabGroupId,
    setCabGroupId,
    start,
    setStart,
    end,
    setEnd,
    windowInvalid,
    windowHalf,
    hasPreview,
    conflicts,
    causesDowntime,
    setCausesDowntime,
    canAssignOwner,
    owner,
    setOwner,
    ownerSearch,
    setOwnerSearch,
    owners,
    ownersLoading,
    implementationPlan,
    setImplementationPlan,
    backoutPlan,
    setBackoutPlan,
    testPlan,
    setTestPlan,
    communicationPlan,
    setCommunicationPlan,
  } = props;
  const ownersQuery = { data: { items: owners }, isFetching: ownersLoading };
  const debouncedPreview = hasPreview;
  const conflictsPreview = { data: conflicts };
  return (
    <>
      {" "}
      <ChangeServicePicker
        label={t("changes.fields.services")}
        options={options.services}
        value={serviceIds}
        onChange={setServiceIds}
        disabled={locked}
        hint={standard ? t("changes.form.servicesStandardHint") : t("changes.form.servicesHint")}
      />
      {capabilities.cmdbEnabled ? (
        <ChangeAssetPicker value={assets} onChange={setAssets} disabled={locked} />
      ) : null}
      {capabilities.problemsEnabled ? (
        <ChangeProblemPicker value={problem} onChange={setProblem} disabled={locked} />
      ) : null}
      {!standard ? (
        <Field label={t("changes.fields.cabGroup")} hint={t("changes.form.cabGroupHint")}>
          {(control) => (
            <Select
              {...control}
              value={cabGroupId}
              disabled={locked}
              onChange={(event) => setCabGroupId(event.target.value)}
            >
              {change?.cabGroup &&
              !options.cabGroups.some((group) => group.id === change.cabGroup?.id) ? (
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
        <legend className="mb-1.5 text-[12.5px] font-medium text-foreground">
          {t("changes.form.window")}
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("changes.fields.plannedStart")}>
            {(control) => (
              <Input
                {...control}
                type="datetime-local"
                value={start}
                onChange={(event) => setStart(event.target.value)}
                data-testid="change-form-start"
              />
            )}
          </Field>
          <Field label={t("changes.fields.plannedEnd")}>
            {(control) => (
              <Input
                {...control}
                type="datetime-local"
                value={end}
                onChange={(event) => setEnd(event.target.value)}
                data-testid="change-form-end"
              />
            )}
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
          <div
            className="grid gap-1.5 rounded-md border border-border/70 px-3 py-2"
            aria-live="polite"
            data-testid="change-form-conflicts"
          >
            <p className="text-[12px] font-medium text-foreground">
              {t("changes.conflicts.title")}
            </p>
            <ChangeConflictsList conflicts={conflictsPreview.data} />
          </div>
        ) : null}
        <Checkbox
          label={t("changes.fields.causesDowntime")}
          checked={causesDowntime}
          disabled={locked}
          onChange={(event) => setCausesDowntime(event.target.checked)}
        />
        <p className={hintClassName}>{t("changes.form.causesDowntimeHint")}</p>
      </fieldset>
      {canAssignOwner ? (
        <div className="grid gap-1.5">
          <span className="text-[12.5px] font-medium text-foreground">
            {t("changes.fields.owner")}
          </span>
          {owner !== null ? (
            <div className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-[12.5px]">
              <span className="min-w-0">
                <span className="block truncate text-foreground">{owner.displayName}</span>
                {owner.email ? (
                  <span className="block truncate text-[11.5px] text-muted-foreground">
                    {owner.email}
                  </span>
                ) : null}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("changes.form.clearOwner")}
                onClick={() => setOwner(null)}
              >
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
              <ul
                className="grid max-h-40 gap-0.5 overflow-y-auto rounded-md border border-border p-1"
                aria-label={t("changes.form.ownerResults")}
              >
                {(ownersQuery.data?.items ?? []).length === 0 ? (
                  <li className={`px-2 py-1 ${hintClassName}`}>
                    {ownersQuery.isFetching ? t("ui.loading") : t("changes.form.ownerNone")}
                  </li>
                ) : (
                  (ownersQuery.data?.items ?? []).map((item) => (
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
                        {item.email ? (
                          <span className="text-muted-foreground"> · {item.email}</span>
                        ) : null}
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
            {(control) => (
              <Textarea
                {...control}
                rows={4}
                value={implementationPlan}
                maxLength={textMax}
                disabled={locked}
                onChange={(event) => setImplementationPlan(event.target.value)}
              />
            )}
          </Field>
          <Field label={t("changes.fields.backoutPlan")} hint={t("changes.form.planHint")}>
            {(control) => (
              <Textarea
                {...control}
                rows={3}
                value={backoutPlan}
                maxLength={textMax}
                disabled={locked}
                onChange={(event) => setBackoutPlan(event.target.value)}
              />
            )}
          </Field>
          <Field
            label={t("changes.fields.testPlan")}
            hint={options.requireTestPlan ? t("changes.form.testPlanRequired") : undefined}
          >
            {(control) => (
              <Textarea
                {...control}
                rows={3}
                value={testPlan}
                maxLength={textMax}
                disabled={locked}
                onChange={(event) => setTestPlan(event.target.value)}
              />
            )}
          </Field>
        </>
      ) : null}
      <Field label={t("changes.fields.communicationPlan")}>
        {(control) => (
          <Textarea
            {...control}
            rows={2}
            value={communicationPlan}
            maxLength={textMax}
            disabled={locked}
            onChange={(event) => setCommunicationPlan(event.target.value)}
          />
        )}
      </Field>
    </>
  );
}
