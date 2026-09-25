import { AlertTriangle, ArrowLeft, Eye } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AdminConfigChangedBanner } from "@/components/admin/admin-config-changed-banner";
import { ScopeMultiSelect, type ScopeOption } from "@/components/templates/scope-multi-select";
import { VariablePalette } from "@/components/templates/variable-palette";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { hintClassName, selectCompactClassName, textareaClassName } from "@/components/ui/control";
import { Field, Input, Select } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useAdminConfigLiveRefresh } from "@/lib/realtime/use-admin-config-live-refresh";
import { mapTemplatesError, type TemplatesErrorKey } from "@/lib/templates/map-templates-error";
import { parseTagsInput, unknownTemplateVariables } from "@/lib/templates/template-variables";
import { cn } from "@/lib/utils";
import { listGroups } from "@/services/groups-api";
import { listServices } from "@/services/service-catalog-api";
import { listServiceCategories } from "@/services/service-categories-api";
import {
  createResponseTemplate,
  getResponseTemplate,
  previewResponseTemplate,
  updateResponseTemplate,
  type RenderedTemplate,
  type ResponseTemplateKind,
  type ResponseTemplateOwnership,
  type TemplateLocale,
} from "@/services/templates-api";

type Form = {
  name: string;
  kind: ResponseTemplateKind;
  bodyBs: string;
  bodyEn: string;
  tags: string;
  isActive: boolean;
  serviceIds: readonly string[];
  categoryIds: readonly string[];
  groupIds: readonly string[];
  reason: string;
};

const emptyForm: Form = {
  name: "",
  kind: "REPLY",
  bodyBs: "",
  bodyEn: "",
  tags: "",
  isActive: true,
  serviceIds: [],
  categoryIds: [],
  groupIds: [],
  reason: "",
};

type BodyField = "bodyBs" | "bodyEn";

/**
 * Paket 1.4 (A1): dedicated editor page — form on the left, live preview on
 * the right (sample ticket or a real one the admin can open), clickable
 * variables. Personal templates have no scope and need no reason.
 */
export function ResponseTemplateEditorPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { templateId } = useParams<{ templateId: string }>();
  const [searchParams] = useSearchParams();
  const isNew = templateId === undefined;
  const [ownership, setOwnership] = useState<ResponseTemplateOwnership>(
    searchParams.get("ownership") === "personal" ? "personal" : "shared",
  );
  const [form, setForm] = useState<Form>(emptyForm);
  const [canEdit, setCanEdit] = useState(true);
  const [loaded, setLoaded] = useState(isNew);
  const [errorKey, setErrorKey] = useState<TemplatesErrorKey | null>(null);
  const [saving, setSaving] = useState(false);
  const [services, setServices] = useState<readonly ScopeOption[]>([]);
  const [categories, setCategories] = useState<readonly ScopeOption[]>([]);
  const [groups, setGroups] = useState<readonly ScopeOption[]>([]);
  const [previewLocale, setPreviewLocale] = useState<TemplateLocale>("bs");
  const [previewTicketId, setPreviewTicketId] = useState("");
  const [preview, setPreview] = useState<RenderedTemplate | null>(null);
  const [previewErrorKey, setPreviewErrorKey] = useState<TemplatesErrorKey | null>(null);
  const [activeBody, setActiveBody] = useState<BodyField>("bodyBs");
  const bodyReferences = { bodyBs: useRef<HTMLTextAreaElement>(null), bodyEn: useRef<HTMLTextAreaElement>(null) };
  const containerRef = useRef<HTMLElement>(null);
  const shared = ownership === "shared";

  const load = useCallback(async () => {
    if (templateId === undefined) return;
    try {
      const template = await getResponseTemplate(templateId);
      setOwnership(template.ownership);
      setCanEdit(template.canEdit);
      setForm({
        name: template.name,
        kind: template.kind,
        bodyBs: template.bodyBs,
        bodyEn: template.bodyEn ?? "",
        tags: template.tags.join(", "),
        isActive: template.isActive,
        serviceIds: template.serviceIds,
        categoryIds: template.categoryIds,
        groupIds: template.groupIds,
        reason: "",
      });
      setErrorKey(null);
    } catch (error) {
      setErrorKey(mapTemplatesError(error));
    } finally {
      setLoaded(true);
    }
  }, [templateId]);

  useEffect(() => {
    void load();
  }, [load]);

  const live = useAdminConfigLiveRefresh({ domains: ["templates"], reload: load, containerRef });

  // Scope options (admin endpoints; only needed for shared templates).
  useEffect(() => {
    if (!shared) return;
    let active = true;
    void Promise.allSettled([listServices(), listServiceCategories(), listGroups()]).then(
      ([serviceResult, categoryResult, groupResult]) => {
        if (!active) return;
        if (serviceResult.status === "fulfilled") {
          setServices(serviceResult.value.map((item) => ({ id: item.id, name: item.name })));
        }
        if (categoryResult.status === "fulfilled") {
          setCategories(categoryResult.value.map((item) => ({ id: item.id, name: item.name })));
        }
        if (groupResult.status === "fulfilled") {
          setGroups(
            groupResult.value.map((item) => ({ id: item.id, name: item.name, hint: item.organizationalUnitPath })),
          );
        }
      },
    );
    return () => {
      active = false;
    };
  }, [shared]);

  // Live preview (debounced).
  const previewBody = previewLocale === "en" && form.bodyEn.trim().length > 0 ? form.bodyEn : form.bodyBs;
  useEffect(() => {
    if (previewBody.trim().length === 0) {
      setPreview(null);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      previewResponseTemplate({
        body: previewBody,
        locale: previewLocale,
        ticketId: previewTicketId.trim().length > 0 ? previewTicketId.trim() : undefined,
      })
        .then((result) => {
          if (active) {
            setPreview(result);
            setPreviewErrorKey(null);
          }
        })
        .catch((error: unknown) => {
          if (active) setPreviewErrorKey(mapTemplatesError(error));
        });
    }, 350);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [previewBody, previewLocale, previewTicketId]);

  const unknown = useMemo(
    () => [...new Set([...unknownTemplateVariables(form.bodyBs), ...unknownTemplateVariables(form.bodyEn)])],
    [form.bodyBs, form.bodyEn],
  );

  const update = <K extends keyof Form>(key: K, value: Form[K]) => setForm((current) => ({ ...current, [key]: value }));

  const insertVariable = (placeholder: string) => {
    const area = bodyReferences[activeBody].current;
    const value = form[activeBody];
    const start = area?.selectionStart ?? value.length;
    const end = area?.selectionEnd ?? value.length;
    // Variables go inline: no automatic line breaks around them.
    const next = `${value.slice(0, start)}${placeholder}${value.slice(end)}`;
    update(activeBody, next);
    window.requestAnimationFrame(() => {
      area?.focus();
      const caret = start + placeholder.length;
      area?.setSelectionRange(caret, caret);
    });
  };

  const save = async () => {
    setSaving(true);
    setErrorKey(null);
    const input = {
      name: form.name,
      kind: form.kind,
      bodyBs: form.bodyBs,
      bodyEn: form.bodyEn.trim().length > 0 ? form.bodyEn : null,
      tags: parseTagsInput(form.tags),
      isActive: form.isActive,
      ...(shared
        ? {
            serviceIds: form.serviceIds,
            categoryIds: form.categoryIds,
            groupIds: form.groupIds,
            reason: form.reason.trim(),
          }
        : {}),
    };
    try {
      const saved = isNew
        ? await createResponseTemplate(ownership, input)
        : await updateResponseTemplate(ownership, templateId, input);
      toast({ tone: "success", title: t("templates.editor.saved") });
      navigate(`/admin/templates?tab=${saved.ownership === "personal" ? "mine" : "shared"}`);
    } catch (error) {
      setErrorKey(mapTemplatesError(error));
    } finally {
      setSaving(false);
    }
  };

  const title = isNew
    ? shared
      ? t("templates.editor.titleNewShared")
      : t("templates.editor.titleNewPersonal")
    : shared
      ? t("templates.editor.titleEditShared")
      : t("templates.editor.titleEditPersonal");
  const disabled = !canEdit || saving;
  const canSubmit =
    canEdit &&
    !saving &&
    form.name.trim().length >= 2 &&
    form.bodyBs.trim().length > 0 &&
    unknown.length === 0 &&
    (!shared || form.reason.trim().length >= 3);

  return (
    <section ref={containerRef} className="space-y-4">
      <PageHeader
        crumbs={["EP-HelpDesk", t("templates.title"), title]}
        title={title}
        subtitle={t("templates.editor.subtitle")}
      />
      <Link
        to={`/admin/templates?tab=${shared ? "shared" : "mine"}`}
        className="inline-flex items-center gap-1.5 text-[12.5px] text-link hover:underline"
      >
        <ArrowLeft size={13} /> {t("templates.actions.back")}
      </Link>
      <AdminConfigChangedBanner pending={live.pending} onRefresh={live.refreshNow} onDismiss={live.dismiss} />
      {!loaded ? (
        <PanelSkeleton label={title} />
      ) : (
        <form
          className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit) void save();
          }}
        >
          <Card className="space-y-4 p-4">
            {!canEdit ? (
              <p className="rounded-md border border-border bg-elevated/60 px-3 py-2 text-[12.5px] text-muted-foreground">
                {t("templates.editor.noPermission")}
              </p>
            ) : null}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <Field label={t("templates.editor.name")} required>
                <Input
                  value={form.name}
                  onChange={(event) => update("name", event.target.value)}
                  maxLength={120}
                  disabled={disabled}
                  data-testid="template-name"
                />
              </Field>
              <Field label={t("templates.editor.kind")} hint={t("templates.editor.kindHint")}>
                <Select
                  value={form.kind}
                  onChange={(event) => update("kind", event.target.value as ResponseTemplateKind)}
                  disabled={disabled}
                >
                  <option value="REPLY">{t("templates.kind.REPLY")}</option>
                  <option value="INTERNAL">{t("templates.kind.INTERNAL")}</option>
                  <option value="ANY">{t("templates.kind.ANY")}</option>
                </Select>
              </Field>
            </div>
            <Field label={t("templates.editor.bodyBs")} required>
              <textarea
                ref={bodyReferences.bodyBs}
                value={form.bodyBs}
                onChange={(event) => update("bodyBs", event.target.value)}
                onFocus={() => setActiveBody("bodyBs")}
                rows={9}
                className={cn(textareaClassName, "font-mono text-[12.5px]")}
                disabled={disabled}
                data-testid="template-body-bs"
              />
            </Field>
            <Field label={t("templates.editor.bodyEn")} hint={t("templates.editor.bodyEnHint")}>
              <textarea
                ref={bodyReferences.bodyEn}
                value={form.bodyEn}
                onChange={(event) => update("bodyEn", event.target.value)}
                onFocus={() => setActiveBody("bodyEn")}
                rows={5}
                className={cn(textareaClassName, "font-mono text-[12.5px]")}
                disabled={disabled}
              />
            </Field>
            {unknown.length > 0 ? (
              <p role="alert" className="flex items-center gap-1.5 text-[12px] text-danger">
                <AlertTriangle size={12} /> {t("templates.editor.unknownVariables", { names: unknown.join(", ") })}
              </p>
            ) : null}
            <VariablePalette onInsert={insertVariable} disabled={disabled} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={t("templates.editor.tags")} hint={t("templates.editor.tagsHint")}>
                <Input value={form.tags} onChange={(event) => update("tags", event.target.value)} disabled={disabled} />
              </Field>
              <div className="flex items-end pb-2">
                <Checkbox
                  checked={form.isActive}
                  onChange={(event) => update("isActive", event.target.checked)}
                  disabled={disabled}
                  label={<span className="text-[12.5px]">{t("templates.editor.active")}</span>}
                />
              </div>
            </div>
            {shared ? (
              <div className="space-y-3 border-t border-border/70 pt-4">
                <div>
                  <p className="text-[13px] font-semibold text-foreground">{t("templates.editor.scope")}</p>
                  <p className={hintClassName}>{t("templates.editor.scopeHint")}</p>
                </div>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                  <ScopeMultiSelect
                    label={t("templates.editor.services")}
                    options={services}
                    value={form.serviceIds}
                    onChange={(next) => update("serviceIds", next)}
                    disabled={disabled}
                    testId="template-scope-services"
                  />
                  <ScopeMultiSelect
                    label={t("templates.editor.categories")}
                    options={categories}
                    value={form.categoryIds}
                    onChange={(next) => update("categoryIds", next)}
                    disabled={disabled}
                  />
                  <ScopeMultiSelect
                    label={t("templates.editor.groups")}
                    options={groups}
                    value={form.groupIds}
                    onChange={(next) => update("groupIds", next)}
                    disabled={disabled}
                  />
                </div>
                <Field label={t("templates.editor.reason")} required hint={t("templates.editor.reasonHint")}>
                  <Input
                    value={form.reason}
                    onChange={(event) => update("reason", event.target.value)}
                    maxLength={500}
                    disabled={disabled}
                    data-testid="template-reason"
                  />
                </Field>
              </div>
            ) : null}
            {errorKey !== null ? (
              <p role="alert" className="text-[12.5px] text-danger">
                {t(errorKey)}
              </p>
            ) : null}
            {canEdit ? (
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => navigate(-1)} disabled={saving}>
                  {t("templates.editor.cancel")}
                </Button>
                <Button type="submit" disabled={!canSubmit} data-testid="template-save">
                  {saving ? t("templates.editor.saving") : t("templates.editor.save")}
                </Button>
              </div>
            ) : null}
          </Card>
          <Card className="flex flex-col xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:self-start">
            <CardHeader
              title={
                <span className="flex items-center gap-1.5">
                  <Eye size={14} /> {t("templates.editor.preview")}
                </span>
              }
              actions={
                <select
                  value={previewLocale}
                  onChange={(event) => setPreviewLocale(event.target.value as TemplateLocale)}
                  aria-label={t("templates.editor.previewLocale")}
                  className={cn(selectCompactClassName, "w-auto")}
                >
                  <option value="bs">BS</option>
                  <option value="en">EN</option>
                </select>
              }
            />
            <div className="space-y-3 overflow-y-auto p-4">
              <Field label={t("templates.editor.previewTicket")} hint={t("templates.editor.previewTicketHint")}>
                <Input
                  value={previewTicketId}
                  onChange={(event) => setPreviewTicketId(event.target.value)}
                  maxLength={64}
                  placeholder="cm…"
                />
              </Field>
              {previewErrorKey !== null ? (
                <p role="alert" className="text-[12.5px] text-danger">
                  {t(previewErrorKey)}
                </p>
              ) : null}
              <div
                className="min-h-[180px] whitespace-pre-wrap rounded-lg border border-border bg-surface px-3.5 py-2.5 text-[13px] leading-relaxed text-foreground/95 shadow-card"
                data-testid="template-preview"
                aria-live="polite"
              >
                {preview?.text ?? <span className="text-muted-foreground">{t("templates.editor.previewEmpty")}</span>}
              </div>
              {preview !== null && preview.missing.length > 0 ? (
                <p className="flex items-start gap-1.5 text-[12px] text-warning">
                  <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                  {t("templates.editor.previewMissing", {
                    names: preview.missing.map((name) => t(`templates.variable.${name}`)).join(", "),
                  })}
                </p>
              ) : null}
            </div>
          </Card>
        </form>
      )}
    </section>
  );
}
