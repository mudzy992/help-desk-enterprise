import { useEffect, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileStack, Pencil, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ChangeServicePicker } from "@/components/changes/change-service-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { errorTextClassName, hintClassName, tableHeadClassName, tableRowClassName } from "@/components/ui/control";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { changeLevelKeys, changeRiskKeys, changeRiskTone, computeChangeRisk, mapChangeError } from "@/lib/changes/change-view";
import { mapApiError } from "@/lib/map-api-error";
import {
  changeExtraKeys,
  changeLevels,
  changeQueryKeys,
  createChangeTemplate,
  listChangeTemplates,
  updateChangeTemplate,
  type ChangeLevel,
  type ChangeOptions,
  type ChangeTemplate,
} from "@/services/changes-api";

/**
 * Paket 3.4 (§13): standard change templates. Only change managers see this
 * tab; templates are deactivated, never deleted, and must stay low or medium risk.
 */
export function ChangeTemplatesPanel({ options }: { readonly options: ChangeOptions | undefined }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [includeInactive, setIncludeInactive] = useState(false);
  const [editing, setEditing] = useState<ChangeTemplate | "new" | null>(null);
  const query = useQuery({ queryKey: changeExtraKeys.templates(includeInactive), queryFn: () => listChangeTemplates(includeInactive), retry: false });

  return (
    <div className="grid gap-3" data-testid="change-templates">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Checkbox label={t("changes.templates.includeInactive")} checked={includeInactive} onChange={(event) => setIncludeInactive(event.target.checked)} />
        <Button variant="primary" size="sm" onClick={() => setEditing("new")} disabled={options === undefined} data-testid="change-template-create">
          <Plus size={14} aria-hidden="true" />
          {t("changes.templates.create")}
        </Button>
      </div>
      {query.isLoading ? (
        <PanelSkeleton label={t("ui.loading")} />
      ) : query.error || query.data === undefined ? (
        <p role="alert" className={errorTextClassName}>
          {t(mapChangeError(query.error) ?? mapApiError(query.error))}
        </p>
      ) : query.data.items.length === 0 ? (
        <EmptyState icon={<FileStack size={18} />} title={t("changes.templates.emptyTitle")} body={t("changes.templates.emptyBody")} />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <caption className="sr-only">{t("changes.templates.caption")}</caption>
              <thead>
                <tr className={tableHeadClassName}>
                  <th scope="col" className="px-3 py-2 text-left">{t("changes.templates.name")}</th>
                  <th scope="col" className="px-3 py-2 text-left">{t("changes.fields.risk")}</th>
                  <th scope="col" className="px-3 py-2 text-left">{t("changes.fields.services")}</th>
                  <th scope="col" className="px-3 py-2 text-right">{t("changes.templates.usage")}</th>
                  <th scope="col" className="px-3 py-2 text-left">{t("changes.templates.state")}</th>
                  <th scope="col" className="px-3 py-2 text-right">
                    <span className="sr-only">{t("changes.templates.actions")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((item) => (
                  <tr key={item.id} className={tableRowClassName}>
                    <td className="max-w-[22rem] px-3 py-2">
                      <span className="block truncate font-medium text-foreground">{item.name}</span>
                      {item.description ? <span className="block truncate text-[11.5px] text-muted-foreground">{item.description}</span> : null}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={changeRiskTone(item.risk)}>{t(changeRiskKeys[item.risk])}</Badge>
                    </td>
                    <td className="max-w-[16rem] truncate px-3 py-2 text-muted-foreground">{item.services.map((service) => service.name).join(", ") || "—"}</td>
                    <td className="tnum px-3 py-2 text-right">{item.usageCount}</td>
                    <td className="px-3 py-2">
                      <Badge tone={item.isActive ? "success" : "neutral"}>{item.isActive ? t("changes.templates.active") : t("changes.templates.inactive")}</Badge>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button variant="ghost" size="sm" onClick={() => setEditing(item)} disabled={options === undefined} aria-label={t("changes.templates.editNamed", { name: item.name })}>
                        <Pencil size={13} aria-hidden="true" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {options ? (
        <ChangeTemplateSheet
          template={editing === "new" ? undefined : (editing ?? undefined)}
          open={editing !== null}
          onOpenChange={(open) => (open ? undefined : setEditing(null))}
          options={options}
          onSaved={() => {
            toast({ tone: "success", title: t("changes.templates.saved") });
            void queryClient.invalidateQueries({ queryKey: changeQueryKeys.all });
          }}
        />
      ) : null}
    </div>
  );
}

interface ChangeTemplateSheetProperties {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly template?: ChangeTemplate;
  readonly options: ChangeOptions;
  readonly onSaved: () => void;
}

function ChangeTemplateSheet({ open, onOpenChange, template, options, onSaved }: ChangeTemplateSheetProperties) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [implementationPlan, setImplementationPlan] = useState("");
  const [backoutPlan, setBackoutPlan] = useState("");
  const [testPlan, setTestPlan] = useState("");
  const [impact, setImpact] = useState<ChangeLevel>("LOW");
  const [likelihood, setLikelihood] = useState<ChangeLevel>("LOW");
  const [causesDowntime, setCausesDowntime] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(template?.name ?? "");
    setDescription(template?.description ?? "");
    setImplementationPlan(template?.implementationPlan ?? "");
    setBackoutPlan(template?.backoutPlan ?? "");
    setTestPlan(template?.testPlan ?? "");
    setImpact(template?.impact ?? "LOW");
    setLikelihood(template?.likelihood ?? "LOW");
    setCausesDowntime(template?.causesDowntime ?? false);
    setIsActive(template?.isActive ?? true);
    setServiceIds(template ? template.services.map((service) => service.id) : []);
    setError(null);
  }, [open, template]);

  const risk = computeChangeRisk(impact, likelihood);
  const riskTooHigh = risk === "HIGH" || risk === "CRITICAL";
  const canSubmit = !saving && !riskTooHigh && name.trim().length >= 3 && implementationPlan.trim().length > 0 && backoutPlan.trim().length > 0;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    const body = {
      name: name.trim(),
      description: description.trim(),
      implementationPlan: implementationPlan.trim(),
      backoutPlan: backoutPlan.trim(),
      testPlan: testPlan.trim() || null,
      impact,
      likelihood,
      causesDowntime,
      isActive,
      serviceIds,
    };
    try {
      if (template) await updateChangeTemplate(template.id, body);
      else await createChangeTemplate(body);
      onOpenChange(false);
      onSaved();
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

  return (
    <Sheet open={open} onOpenChange={(next) => (saving ? undefined : onOpenChange(next))}>
      <SheetContent side="right" className="flex w-full max-w-xl flex-col overflow-y-auto p-5" data-testid="change-template-sheet">
        <SheetTitle>{template ? t("changes.templates.editTitle") : t("changes.templates.createTitle")}</SheetTitle>
        <SheetDescription className="mt-1 text-[12px] text-muted-foreground">{t("changes.templates.sheetDescription")}</SheetDescription>
        <form className="mt-4 grid gap-3" onSubmit={(event) => void submit(event)} noValidate>
          <Field label={t("changes.templates.name")} required>
            {(control) => <Input {...control} value={name} maxLength={200} onChange={(event) => setName(event.target.value)} autoFocus />}
          </Field>
          <Field label={t("changes.fields.description")}>
            {(control) => <Textarea {...control} rows={3} value={description} maxLength={4000} onChange={(event) => setDescription(event.target.value)} />}
          </Field>
          <Field label={t("changes.fields.implementationPlan")} required>
            {(control) => <Textarea {...control} rows={4} value={implementationPlan} maxLength={8000} onChange={(event) => setImplementationPlan(event.target.value)} />}
          </Field>
          <Field label={t("changes.fields.backoutPlan")} required>
            {(control) => <Textarea {...control} rows={3} value={backoutPlan} maxLength={8000} onChange={(event) => setBackoutPlan(event.target.value)} />}
          </Field>
          <Field label={t("changes.fields.testPlan")}>
            {(control) => <Textarea {...control} rows={3} value={testPlan} maxLength={8000} onChange={(event) => setTestPlan(event.target.value)} />}
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("changes.fields.impact")}>
              {(control) => (
                <Select {...control} value={impact} onChange={(event) => setImpact(event.target.value as ChangeLevel)}>
                  {levelOptions}
                </Select>
              )}
            </Field>
            <Field label={t("changes.fields.likelihood")}>
              {(control) => (
                <Select {...control} value={likelihood} onChange={(event) => setLikelihood(event.target.value as ChangeLevel)}>
                  {levelOptions}
                </Select>
              )}
            </Field>
          </div>
          <p className="flex items-center gap-2 text-[12.5px]" aria-live="polite">
            <span className="text-muted-foreground">{t("changes.form.riskPreview")}</span>
            <Badge tone={changeRiskTone(risk)}>{t(changeRiskKeys[risk])}</Badge>
          </p>
          {riskTooHigh ? (
            <p role="alert" className={errorTextClassName}>
              {t("changes.errors.templateRisk")}
            </p>
          ) : null}
          <ChangeServicePicker label={t("changes.fields.services")} options={options.services} value={serviceIds} onChange={setServiceIds} />
          <Checkbox label={t("changes.fields.causesDowntime")} checked={causesDowntime} onChange={(event) => setCausesDowntime(event.target.checked)} />
          <Checkbox label={t("changes.templates.active")} checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
          <p className={hintClassName}>{t("changes.templates.activeHint")}</p>
          {error !== null ? (
            <p role="alert" className={errorTextClassName}>
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
              {t("ui.cancel")}
            </Button>
            <Button type="submit" disabled={!canSubmit} data-testid="change-template-submit">
              {saving ? t("changes.form.saving") : t("changes.form.save")}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
