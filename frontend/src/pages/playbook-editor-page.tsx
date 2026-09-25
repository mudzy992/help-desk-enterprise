import { ArrowDown, ArrowLeft, ArrowUp, ClipboardList, GripVertical, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AdminConfigChangedBanner } from "@/components/admin/admin-config-changed-banner";
import { ScopeMultiSelect, type ScopeOption } from "@/components/templates/scope-multi-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { hintClassName } from "@/components/ui/control";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useAdminConfigLiveRefresh } from "@/lib/realtime/use-admin-config-live-refresh";
import { mapTemplatesError, type TemplatesErrorKey } from "@/lib/templates/map-templates-error";
import { moveItem } from "@/lib/templates/reorder-steps";
import { cn } from "@/lib/utils";
import { listKnowledgeArticles } from "@/services/knowledge-base-api";
import { listServices } from "@/services/service-catalog-api";
import { listServiceCategories } from "@/services/service-categories-api";
import { createPlaybook, getPlaybook, listManagedTemplates, updatePlaybook } from "@/services/templates-api";

type StepDraft = {
  readonly uid: string;
  readonly stepKey?: string;
  readonly title: string;
  readonly instructions: string;
  readonly required: boolean;
  readonly knowledgeArticleId: string;
  readonly responseTemplateId: string;
};

let uidCounter = 0;
const newUid = () => `draft-${++uidCounter}`;
const blankStep = (): StepDraft => ({
  uid: newUid(),
  title: "",
  instructions: "",
  required: false,
  knowledgeArticleId: "",
  responseTemplateId: "",
});

/**
 * Paket 1.4 (P1, A1): playbook editor. Steps reorder by drag & drop or with
 * the ↑/↓ buttons (keyboard and screen-reader friendly). Existing steps keep
 * their `stepKey`, so running checklists keep finished steps on upgrade.
 */
export function PlaybookEditorPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { playbookId } = useParams<{ playbookId: string }>();
  const isNew = playbookId === undefined;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [serviceIds, setServiceIds] = useState<readonly string[]>([]);
  const [categoryIds, setCategoryIds] = useState<readonly string[]>([]);
  const [steps, setSteps] = useState<readonly StepDraft[]>([blankStep()]);
  const [reason, setReason] = useState("");
  const [version, setVersion] = useState<number | null>(null);
  const [activeTickets, setActiveTickets] = useState(0);
  const [canEdit, setCanEdit] = useState(true);
  const [loaded, setLoaded] = useState(isNew);
  const [saving, setSaving] = useState(false);
  const [errorKey, setErrorKey] = useState<TemplatesErrorKey | null>(null);
  const [services, setServices] = useState<readonly ScopeOption[]>([]);
  const [categories, setCategories] = useState<readonly ScopeOption[]>([]);
  const [articles, setArticles] = useState<readonly ScopeOption[]>([]);
  const [templates, setTemplates] = useState<readonly ScopeOption[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    if (playbookId === undefined) return;
    try {
      const playbook = await getPlaybook(playbookId);
      setName(playbook.name);
      setDescription(playbook.description ?? "");
      setIsActive(playbook.isActive);
      setServiceIds(playbook.serviceIds);
      setCategoryIds(playbook.categoryIds);
      setVersion(playbook.version);
      setActiveTickets(playbook.activeTicketCount);
      setCanEdit(playbook.canEdit);
      setSteps(
        playbook.steps.map((step) => ({
          uid: step.stepKey,
          stepKey: step.stepKey,
          title: step.title,
          instructions: step.instructions ?? "",
          required: step.required,
          knowledgeArticleId: step.knowledgeArticleId ?? "",
          responseTemplateId: step.responseTemplateId ?? "",
        })),
      );
      setErrorKey(null);
    } catch (error) {
      setErrorKey(mapTemplatesError(error));
    } finally {
      setLoaded(true);
    }
  }, [playbookId]);

  useEffect(() => {
    void load();
  }, [load]);

  const live = useAdminConfigLiveRefresh({ domains: ["templates"], reload: load, containerRef });

  useEffect(() => {
    let active = true;
    void Promise.allSettled([
      listServices(),
      listServiceCategories(),
      listKnowledgeArticles({ status: "PUBLISHED" }),
      listManagedTemplates({ ownership: "shared", state: "active" }),
    ]).then(([serviceResult, categoryResult, articleResult, templateResult]) => {
      if (!active) return;
      if (serviceResult.status === "fulfilled") setServices(serviceResult.value.map((item) => ({ id: item.id, name: item.name })));
      if (categoryResult.status === "fulfilled") setCategories(categoryResult.value.map((item) => ({ id: item.id, name: item.name })));
      if (articleResult.status === "fulfilled") setArticles(articleResult.value.map((item) => ({ id: item.id, name: item.title })));
      if (templateResult.status === "fulfilled") setTemplates(templateResult.value.map((item) => ({ id: item.id, name: item.name })));
    });
    return () => {
      active = false;
    };
  }, []);

  const updateStep = (index: number, patch: Partial<StepDraft>) =>
    setSteps((current) => current.map((step, position) => (position === index ? { ...step, ...patch } : step)));

  const save = async () => {
    setSaving(true);
    setErrorKey(null);
    const input = {
      name,
      description: description.trim().length > 0 ? description : null,
      isActive,
      serviceIds,
      categoryIds,
      reason: reason.trim(),
      steps: steps.map((step) => ({
        ...(step.stepKey === undefined ? {} : { stepKey: step.stepKey }),
        title: step.title,
        instructions: step.instructions.trim().length > 0 ? step.instructions : null,
        required: step.required,
        knowledgeArticleId: step.knowledgeArticleId || null,
        responseTemplateId: step.responseTemplateId || null,
      })),
    };
    try {
      if (isNew) await createPlaybook(input);
      else await updatePlaybook(playbookId, input);
      toast({ tone: "success", title: t("templates.playbook.saved") });
      navigate("/admin/templates?tab=playbooks");
    } catch (error) {
      setErrorKey(mapTemplatesError(error));
    } finally {
      setSaving(false);
    }
  };

  const title = isNew ? t("templates.playbook.titleNew") : t("templates.playbook.titleEdit");
  const disabled = !canEdit || saving;
  const canSubmit =
    canEdit &&
    !saving &&
    name.trim().length >= 2 &&
    steps.length > 0 &&
    steps.every((step) => step.title.trim().length > 0) &&
    reason.trim().length >= 3;

  return (
    <section ref={containerRef} className="space-y-4">
      <PageHeader crumbs={["EP-HelpDesk", t("templates.title"), title]} title={title} subtitle={t("templates.playbook.subtitle")} />
      <Link to="/admin/templates?tab=playbooks" className="inline-flex items-center gap-1.5 text-[12.5px] text-link hover:underline">
        <ArrowLeft size={13} /> {t("templates.actions.back")}
      </Link>
      <AdminConfigChangedBanner pending={live.pending} onRefresh={live.refreshNow} onDismiss={live.dismiss} />
      {!loaded ? (
        <PanelSkeleton label={title} />
      ) : (
        <form
          className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit) void save();
          }}
        >
          <div className="space-y-4">
            <Card className="space-y-4 p-4">
              {!canEdit ? (
                <p className="rounded-md border border-border bg-elevated/60 px-3 py-2 text-[12.5px] text-muted-foreground">
                  {t("templates.editor.noPermission")}
                </p>
              ) : null}
              <Field label={t("templates.playbook.name")} required>
                <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} disabled={disabled} data-testid="playbook-name" />
              </Field>
              <Field label={t("templates.playbook.description")}>
                <Textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} maxLength={2000} disabled={disabled} />
              </Field>
              <Checkbox
                checked={isActive}
                onChange={(event) => setIsActive(event.target.checked)}
                disabled={disabled}
                label={<span className="text-[12.5px]">{t("templates.playbook.active")}</span>}
              />
              <div className="space-y-3 border-t border-border/70 pt-4">
                <div>
                  <p className="text-[13px] font-semibold text-foreground">{t("templates.playbook.scope")}</p>
                  <p className={hintClassName}>{t("templates.playbook.scopeHint")}</p>
                </div>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <ScopeMultiSelect
                    label={t("templates.editor.services")}
                    options={services}
                    value={serviceIds}
                    onChange={setServiceIds}
                    disabled={disabled}
                    testId="playbook-scope-services"
                  />
                  <ScopeMultiSelect label={t("templates.editor.categories")} options={categories} value={categoryIds} onChange={setCategoryIds} disabled={disabled} />
                </div>
              </div>
            </Card>
            <Card>
              <CardHeader
                title={t("templates.playbook.steps")}
                subtitle={
                  version !== null
                    ? `${t("templates.playbook.versionNote", { version })} ${t("templates.playbook.activeTickets", { count: activeTickets })}`
                    : undefined
                }
                actions={
                  canEdit ? (
                    <Button type="button" size="xs" variant="secondary" onClick={() => setSteps((current) => [...current, blankStep()])} disabled={disabled || steps.length >= 50} data-testid="playbook-add-step">
                      <Plus size={12} /> {t("templates.playbook.addStep")}
                    </Button>
                  ) : null
                }
              />
              <ol className="space-y-3 p-4">
                {steps.map((step, index) => (
                  <li
                    key={step.uid}
                    onDragOver={(event) => {
                      if (dragIndex !== null) event.preventDefault();
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (dragIndex !== null) setSteps((current) => moveItem(current, dragIndex, index));
                      setDragIndex(null);
                    }}
                    className={cn(
                      "rounded-lg border border-border bg-surface p-3",
                      dragIndex === index && "opacity-50",
                    )}
                    data-testid="playbook-step"
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <span
                        draggable={canEdit}
                        onDragStart={(event) => {
                          setDragIndex(index);
                          event.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => setDragIndex(null)}
                        title={t("templates.playbook.dragHandle")}
                        aria-hidden="true"
                        className={cn("text-muted-foreground", canEdit && "cursor-grab")}
                      >
                        <GripVertical size={14} />
                      </span>
                      <span className="text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {t("templates.playbook.stepNumber", { number: index + 1 })}
                      </span>
                      {canEdit ? (
                        <div className="ml-auto flex items-center gap-0.5">
                          <Button type="button" size="icon" variant="ghost" aria-label={t("templates.playbook.moveUp")} disabled={disabled || index === 0} onClick={() => setSteps((current) => moveItem(current, index, index - 1))}>
                            <ArrowUp size={13} />
                          </Button>
                          <Button type="button" size="icon" variant="ghost" aria-label={t("templates.playbook.moveDown")} disabled={disabled || index === steps.length - 1} onClick={() => setSteps((current) => moveItem(current, index, index + 1))}>
                            <ArrowDown size={13} />
                          </Button>
                          <Button type="button" size="icon" variant="ghost" aria-label={t("templates.playbook.removeStep")} disabled={disabled || steps.length === 1} onClick={() => setSteps((current) => current.filter((_, position) => position !== index))}>
                            <Trash2 size={13} />
                          </Button>
                        </div>
                      ) : null}
                    </div>
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                        <Field label={t("templates.playbook.stepTitle")} required>
                          <Input value={step.title} onChange={(event) => updateStep(index, { title: event.target.value })} maxLength={200} disabled={disabled} data-testid={`playbook-step-title-${index + 1}`} />
                        </Field>
                        <div className="pb-2">
                          <Checkbox
                            checked={step.required}
                            onChange={(event) => updateStep(index, { required: event.target.checked })}
                            disabled={disabled}
                            data-testid={`playbook-step-required-${index + 1}`}
                            label={<span className="text-[12.5px]">{t("templates.playbook.stepRequired")}</span>}
                          />
                        </div>
                      </div>
                      <Field label={t("templates.playbook.stepInstructions")}>
                        <Textarea value={step.instructions} onChange={(event) => updateStep(index, { instructions: event.target.value })} rows={2} maxLength={4000} disabled={disabled} />
                      </Field>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Field label={t("templates.playbook.stepArticle")}>
                          <Select value={step.knowledgeArticleId} onChange={(event) => updateStep(index, { knowledgeArticleId: event.target.value })} disabled={disabled}>
                            <option value="">{t("templates.playbook.stepArticleNone")}</option>
                            {withCurrent(articles, step.knowledgeArticleId).map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.name}
                              </option>
                            ))}
                          </Select>
                        </Field>
                        <Field label={t("templates.playbook.stepTemplate")}>
                          <Select value={step.responseTemplateId} onChange={(event) => updateStep(index, { responseTemplateId: event.target.value })} disabled={disabled}>
                            <option value="">{t("templates.playbook.stepTemplateNone")}</option>
                            {withCurrent(templates, step.responseTemplateId).map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.name}
                              </option>
                            ))}
                          </Select>
                        </Field>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </Card>
            {canEdit ? (
              <Card className="space-y-3 p-4">
                <Field label={t("templates.editor.reason")} required hint={t("templates.editor.reasonHint")}>
                  <Input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} disabled={disabled} data-testid="playbook-reason" />
                </Field>
                {errorKey !== null ? (
                  <p role="alert" className="text-[12.5px] text-danger">
                    {t(errorKey)}
                  </p>
                ) : null}
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="secondary" onClick={() => navigate(-1)} disabled={saving}>
                    {t("templates.editor.cancel")}
                  </Button>
                  <Button type="submit" disabled={!canSubmit} data-testid="playbook-save">
                    {saving ? t("templates.editor.saving") : t("templates.editor.save")}
                  </Button>
                </div>
              </Card>
            ) : errorKey !== null ? (
              <p role="alert" className="text-[12.5px] text-danger">
                {t(errorKey)}
              </p>
            ) : null}
          </div>
          <Card className="xl:sticky xl:top-4 xl:self-start">
            <CardHeader
              title={
                <span className="flex items-center gap-1.5">
                  <ClipboardList size={14} /> {t("templates.playbook.previewTitle")}
                </span>
              }
              subtitle={name.trim().length > 0 ? name : undefined}
            />
            <ol className="space-y-2 p-4">
              {steps.map((step, index) => (
                <li key={step.uid} className="flex items-start gap-2 rounded-md border border-border/70 px-2.5 py-2">
                  <span className="mt-0.5 inline-flex size-4 shrink-0 rounded-[5px] border border-line-strong bg-surface" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] text-foreground">
                      {step.title.trim().length > 0 ? step.title : <span className="text-muted-foreground">{t("templates.playbook.stepNumber", { number: index + 1 })}</span>}
                    </p>
                    {step.instructions.trim().length > 0 ? (
                      <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap text-[11px] text-muted-foreground">{step.instructions}</p>
                    ) : null}
                  </div>
                  {step.required ? <Badge tone="warning">{t("templates.playbook.requiredBadge")}</Badge> : null}
                </li>
              ))}
            </ol>
          </Card>
        </form>
      )}
    </section>
  );
}

/** Keeps a selected id visible even if it is no longer in the loaded list. */
function withCurrent(options: readonly ScopeOption[], currentId: string): readonly ScopeOption[] {
  if (currentId === "" || options.some((option) => option.id === currentId)) return options;
  return [...options, { id: currentId, name: currentId }];
}
