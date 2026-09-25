import { AlertTriangle, Mail, RotateCcw, Send } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { SettingsReasonConfirm } from "@/components/settings/settings-reason-confirm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { hintClassName, selectCompactClassName } from "@/components/ui/control";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import {
  buildTemplateOverrides,
  findUnknownPlaceholders,
  insertPlaceholder,
  isTemplateModified,
  replaceTemplate,
} from "@/lib/settings/email-template-draft";
import { cn } from "@/lib/utils";
import { ApiError } from "@/services/api";
import {
  getEmailTemplates,
  previewEmailTemplate,
  saveEmailTemplates,
  sendTestEmailTemplate,
  type EmailTemplateField,
  type EmailTemplateLocale,
  type EmailTemplateRegistry,
  type EmailTemplatesOverview,
  type RenderedEmail,
} from "@/services/email-templates-api";

interface EmailTemplatesCardProperties {
  readonly canWrite: boolean;
}

/** i18next splits keys on "."; template keys such as `ticket.created` use "_". */
const eventLabelKey = (key: string) => `settings.emailTemplates.events.${key.replace(/\./g, "_")}`;

const multilineFields = new Set<EmailTemplateField>(["body", "footer"]);

export function EmailTemplatesCard({ canWrite }: EmailTemplatesCardProperties) {
  const { t } = useTranslation();
  const [overview, setOverview] = useState<EmailTemplatesOverview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const reload = useCallback(async () => {
    try {
      setOverview(await getEmailTemplates());
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const modifiedCount = useMemo(() => {
    if (overview === null) return 0;
    return overview.locales.reduce(
      (count, locale) =>
        count +
        overview.keys.filter((key) => {
          const current = overview.templates[locale][key];
          const fallback = overview.defaults[locale][key];
          return current !== undefined && fallback !== undefined && isTemplateModified(current, fallback);
        }).length,
      0,
    );
  }, [overview]);

  const delivery = overview?.delivery;
  return (
    <>
      <Card className="fade-in" data-testid="email-templates-card">
        <CardHeader
          title={t("settings.emailTemplates.title")}
          subtitle={t("settings.emailTemplates.subtitle")}
        />
        <div className="space-y-2.5 px-4 pb-4 pt-4 text-[12px]">
          {loadError !== null ? <p className="text-danger">{loadError}</p> : null}
          {delivery !== undefined ? (
            <>
              <p className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("settings.emailTemplates.provider")}</span>
                <span className="text-foreground/90">
                  {t(`settings.emailTemplates.providers.${delivery.provider}`)}
                </span>
              </p>
              <p className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("settings.emailTemplates.replyMode")}</span>
                <Badge tone={delivery.replyMode === "shared_mailbox" ? "info" : "neutral"}>
                  {delivery.replyMode === "shared_mailbox"
                    ? t("settings.emailTemplates.replyShared", {
                        address: delivery.replyToAddress ?? "",
                      })
                    : t("settings.emailTemplates.replyNone")}
                </Badge>
              </p>
              <p className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("settings.emailTemplates.customized")}</span>
                <span className="tnum text-foreground/90">
                  {modifiedCount === 0
                    ? t("settings.emailTemplates.allDefault")
                    : t("settings.emailTemplates.modifiedCount", { count: modifiedCount })}
                </span>
              </p>
              {delivery.configuredReplyMode !== delivery.replyMode ? (
                <Warning text={t("settings.emailTemplates.replyFallbackWarning")} />
              ) : null}
              {!delivery.publicUrlConfigured ? (
                <Warning text={t("settings.emailTemplates.publicUrlWarning")} testId="public-url-warning" />
              ) : null}
              {!delivery.hasSmtpTransport ? (
                <Warning text={t("settings.emailTemplates.smtpMissingWarning")} />
              ) : null}
            </>
          ) : null}
          <Button
            type="button"
            size="xs"
            variant="outline"
            className="mt-1"
            disabled={overview === null}
            onClick={() => setOpen(true)}
          >
            <Mail size={13} />
            {t("settings.emailTemplates.open")}
          </Button>
        </div>
      </Card>
      {overview !== null ? (
        <EmailTemplatesEditor
          open={open}
          overview={overview}
          canWrite={canWrite}
          onOpenChange={setOpen}
          onSaved={setOverview}
        />
      ) : null}
    </>
  );
}

function Warning({ text, testId }: { readonly text: string; readonly testId?: string }) {
  return (
    <p
      className="flex items-start gap-1.5 rounded-md border border-warning/30 bg-warning/10 px-2.5 py-2 text-[11.5px] leading-5 text-warning"
      data-testid={testId}
    >
      <AlertTriangle size={13} className="mt-0.5 shrink-0" />
      <span>{text}</span>
    </p>
  );
}

interface EditorProperties {
  readonly open: boolean;
  readonly overview: EmailTemplatesOverview;
  readonly canWrite: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSaved: (overview: EmailTemplatesOverview) => void;
}

function EmailTemplatesEditor({ open, overview, canWrite, onOpenChange, onSaved }: EditorProperties) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [draft, setDraft] = useState<EmailTemplateRegistry>(overview.templates);
  const [locale, setLocale] = useState<EmailTemplateLocale>(overview.locales[0] ?? "bs");
  const [key, setKey] = useState<string>(overview.keys[0] ?? "ticket.created");
  const [confidential, setConfidential] = useState(false);
  const [view, setView] = useState<"html" | "text">("html");
  const [preview, setPreview] = useState<RenderedEmail | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const focused = useRef<{ field: EmailTemplateField; element: HTMLInputElement | HTMLTextAreaElement } | null>(
    null,
  );

  useEffect(() => {
    if (open) setDraft(overview.templates);
  }, [open, overview.templates]);

  const content = draft[locale][key] ?? overview.defaults[locale][key];
  const fallback = overview.defaults[locale][key];
  const isTicketKey = overview.ticketKeys.includes(key);
  const dirty = useMemo(
    () =>
      JSON.stringify(buildTemplateOverrides(draft, overview.defaults)) !==
      JSON.stringify(buildTemplateOverrides(overview.templates, overview.defaults)),
    [draft, overview.defaults, overview.templates],
  );
  const unknownByField = useMemo(() => {
    const result: Partial<Record<EmailTemplateField, readonly string[]>> = {};
    if (content === undefined) return result;
    for (const field of overview.fields) {
      const unknown = findUnknownPlaceholders(content[field], overview.placeholders);
      if (unknown.length > 0) result[field] = unknown;
    }
    return result;
  }, [content, overview.fields, overview.placeholders]);
  const hasUnknown = Object.keys(unknownByField).length > 0;

  // Live preview (debounced) through the server renderer — exactly what recipients get.
  useEffect(() => {
    if (!open || content === undefined || hasUnknown) return undefined;
    const handle = window.setTimeout(() => {
      previewEmailTemplate({ key, locale, content, confidential: isTicketKey && confidential })
        .then((rendered) => {
          setPreview(rendered);
          setPreviewError(null);
        })
        .catch((error: unknown) => setPreviewError(describeError(error)));
    }, 350);
    return () => window.clearTimeout(handle);
  }, [open, key, locale, content, confidential, isTicketKey, hasUnknown]);

  const update = (field: EmailTemplateField, value: string) => {
    if (content === undefined) return;
    setDraft((current) => replaceTemplate(current, locale, key, { ...content, [field]: value }));
  };

  const insert = (name: string) => {
    const target = focused.current;
    if (target === null || content === undefined) return;
    const next = insertPlaceholder(
      content[target.field],
      name,
      target.element.selectionStart,
      target.element.selectionEnd,
    );
    update(target.field, next.value);
    requestAnimationFrame(() => {
      target.element.focus();
      target.element.setSelectionRange(next.caret, next.caret);
    });
  };

  const save = async (reason: string) => {
    setSaving(true);
    try {
      const saved = await saveEmailTemplates({
        overrides: buildTemplateOverrides(draft, overview.defaults),
        reason,
      });
      onSaved(saved);
      setDraft(saved.templates);
      toast({ tone: "success", title: t("settings.emailTemplates.saved") });
    } catch (error) {
      toast({ tone: "danger", title: t("settings.emailTemplates.saveFailed"), description: describeError(error) });
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    if (content === undefined) return;
    setTesting(true);
    try {
      const result = await sendTestEmailTemplate({
        key,
        locale,
        content,
        confidential: isTicketKey && confidential,
      });
      toast({
        tone: "success",
        title: t("settings.emailTemplates.testSent", { address: result.toAddress }),
      });
    } catch (error) {
      toast({
        tone: "danger",
        title: t("settings.emailTemplates.testFailed"),
        description: describeError(error),
        duration: 0,
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full max-w-6xl flex-col overflow-y-auto p-0">
        <div className="border-b border-border/70 px-5 py-4">
          <SheetTitle>{t("settings.emailTemplates.editorTitle")}</SheetTitle>
          <SheetDescription className="mt-1 text-[12px] text-muted-foreground">
            {t("settings.emailTemplates.editorDescription")}
          </SheetDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-5 py-3">
          <select
            className={cn(selectCompactClassName, "w-72")}
            value={key}
            aria-label={t("settings.emailTemplates.event")}
            data-testid="email-template-key"
            onChange={(event) => setKey(event.target.value)}
          >
            {overview.keys.map((item) => {
              const current = draft[locale][item];
              const base = overview.defaults[locale][item];
              const changed = current !== undefined && base !== undefined && isTemplateModified(current, base);
              return (
                <option key={item} value={item}>
                  {t(eventLabelKey(item), { defaultValue: item })}
                  {changed ? ` • ${t("settings.emailTemplates.modified")}` : ""}
                </option>
              );
            })}
          </select>
          <Segmented
            size="sm"
            ariaLabel={t("settings.emailTemplates.language")}
            value={locale}
            onChange={setLocale}
            items={overview.locales.map((item) => ({
              value: item,
              label: t(`settings.emailTemplates.locales.${item}`),
            }))}
          />
          {content !== undefined && fallback !== undefined && isTemplateModified(content, fallback) ? (
            <Badge tone="primary">{t("settings.emailTemplates.modified")}</Badge>
          ) : (
            <Badge tone="neutral">{t("settings.emailTemplates.default")}</Badge>
          )}
        </div>
        {content !== undefined && fallback !== undefined ? (
          <div className="grid flex-1 grid-cols-1 gap-0 lg:grid-cols-2">
            <div className="space-y-3 border-b border-border/70 px-5 py-4 lg:border-b-0 lg:border-r">
              {overview.fields.map((field) => {
                if (field === "subjectConfidential" && !isTicketKey) return null;
                const Control = multilineFields.has(field) ? Textarea : Input;
                const unknown = unknownByField[field];
                return (
                  <Field
                    key={field}
                    label={t(`settings.emailTemplates.fields.${field}`)}
                    hint={t(`settings.emailTemplates.hints.${field}`)}
                  >
                    <Control
                      value={content[field]}
                      disabled={!canWrite}
                      data-testid={`email-template-field-${field}`}
                      onFocus={(event) => {
                        focused.current = { field, element: event.currentTarget };
                      }}
                      onChange={(event) => update(field, event.target.value)}
                      aria-invalid={unknown !== undefined}
                    />
                    {unknown !== undefined ? (
                      <span className="mt-1 block text-[11.5px] text-danger" role="alert">
                        {t("settings.emailTemplates.unknownPlaceholder", {
                          names: unknown.map((name) => `{{${name}}}`).join(", "),
                        })}
                      </span>
                    ) : null}
                  </Field>
                );
              })}
              <div>
                <p className={cn("mb-1.5", hintClassName)}>{t("settings.emailTemplates.placeholdersHint")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {overview.placeholders.map((name) => (
                    <button
                      key={name}
                      type="button"
                      disabled={!canWrite}
                      className="rounded-full border border-border bg-surface px-2 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:border-primary/45 hover:text-link disabled:opacity-45"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => insert(name)}
                    >
                      {`{{${name}}}`}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  disabled={!canWrite || !isTemplateModified(content, fallback)}
                  onClick={() => setDraft((current) => replaceTemplate(current, locale, key, fallback))}
                >
                  <RotateCcw size={13} />
                  {t("settings.emailTemplates.resetTemplate")}
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  disabled={!canWrite || testing || hasUnknown || !overview.delivery.hasSmtpTransport}
                  data-testid="email-template-send-test"
                  onClick={() => void sendTest()}
                >
                  <Send size={13} />
                  {testing ? t("settings.emailTemplates.testSending") : t("settings.emailTemplates.sendTest")}
                </Button>
              </div>
              {canWrite && dirty && !hasUnknown ? (
                <SettingsReasonConfirm
                  pending={saving}
                  onCancel={() => setDraft(overview.templates)}
                  onConfirm={save}
                />
              ) : null}
            </div>
            <div className="flex min-h-[520px] flex-col px-5 py-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Segmented
                  size="sm"
                  ariaLabel={t("settings.emailTemplates.previewFormat")}
                  value={view}
                  onChange={setView}
                  items={[
                    { value: "html", label: "HTML" },
                    { value: "text", label: t("settings.emailTemplates.plainText") },
                  ]}
                />
                {isTicketKey ? (
                  <Segmented
                    size="sm"
                    ariaLabel={t("settings.emailTemplates.sensitivity")}
                    value={confidential ? "confidential" : "normal"}
                    onChange={(value) => setConfidential(value === "confidential")}
                    items={[
                      { value: "normal", label: t("settings.emailTemplates.normal") },
                      { value: "confidential", label: t("settings.emailTemplates.confidential") },
                    ]}
                  />
                ) : null}
              </div>
              {previewError !== null ? <p className="mb-2 text-[12px] text-danger">{previewError}</p> : null}
              {preview !== null ? (
                <>
                  <p className="mb-2 truncate text-[12.5px]" data-testid="email-template-preview-subject">
                    <span className="text-muted-foreground">{t("settings.emailTemplates.subjectLabel")} </span>
                    <span className="font-medium text-foreground">{preview.subject}</span>
                  </p>
                  {view === "html" ? (
                    <iframe
                      title={t("settings.emailTemplates.previewTitle")}
                      // No scripts, no same-origin: the preview cannot touch the app.
                      sandbox=""
                      srcDoc={preview.html}
                      className="min-h-[480px] w-full flex-1 rounded-md border border-border bg-white"
                    />
                  ) : (
                    <pre className="min-h-[480px] flex-1 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-surface p-3 font-mono text-[12px] leading-5 text-foreground">
                      {preview.text}
                    </pre>
                  )}
                </>
              ) : null}
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function describeError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : String(error);
}

