import { Palette, RotateCcw, Send } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { SettingsReasonConfirm } from "@/components/settings/settings-reason-confirm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { hintClassName, selectCompactClassName } from "@/components/ui/control";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
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
  previewEmailTemplate,
  saveEmailTemplates,
  sendTestEmailTemplate,
  type EmailTemplateField,
  type EmailTemplateLocale,
  type EmailTemplateRegistry,
  type EmailTemplatesOverview,
  type RenderedEmail,
} from "@/services/email-templates-api";

/** i18next splits keys on "."; template keys such as `ticket.created` use "_". */
const eventLabelKey = (key: string) => `settings.emailTemplates.events.${key.replace(/\./g, "_")}`;

const multilineFields = new Set<EmailTemplateField>(["body", "footer"]);
const colourPattern = /^#[0-9a-fA-F]{6}$/;
/** Hints show template placeholders literally (i18next would interpolate them). */
const literalPlaceholders = {
  ticketDescription: "{{ticketDescription}}",
  ticketDescriptionShort: "{{ticketDescriptionShort}}",
};

interface EditorProperties {
  readonly overview: EmailTemplatesOverview;
  readonly canWrite: boolean;
  readonly onSaved: (overview: EmailTemplatesOverview) => void;
}

export function EmailTemplatesEditor({ overview, canWrite, onSaved }: EditorProperties) {
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
    setDraft(overview.templates);
  }, [overview.templates]);

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
    if (content === undefined || hasUnknown) return undefined;
    const handle = window.setTimeout(() => {
      previewEmailTemplate({ key, locale, content, confidential: isTicketKey && confidential })
        .then((rendered) => {
          setPreview(rendered);
          setPreviewError(null);
        })
        .catch((error: unknown) => setPreviewError(describeError(error)));
    }, 350);
    return () => window.clearTimeout(handle);
  }, [key, locale, content, confidential, isTicketKey, hasUnknown]);

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
    <Card className="fade-in flex flex-col overflow-hidden p-0" data-testid="email-templates-editor">
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
                if (field === "accentColor") {
                  return (
                    <AccentColorField
                      key={field}
                      value={content.accentColor}
                      disabled={!canWrite}
                      onChange={(value) => update(field, value)}
                    />
                  );
                }
                const Control = multilineFields.has(field) ? Textarea : Input;
                const unknown = unknownByField[field];
                return (
                  <Field
                    key={field}
                    label={t(`settings.emailTemplates.fields.${field}`)}
                    hint={t(`settings.emailTemplates.hints.${field}`, literalPlaceholders)}
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
            <div className="flex min-h-[640px] flex-col px-5 py-4">
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
                      className="min-h-[600px] w-full flex-1 rounded-md border border-border bg-white"
                    />
                  ) : (
                    <pre className="min-h-[600px] flex-1 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-surface p-3 font-mono text-[12px] leading-5 text-foreground">
                      {preview.text}
                    </pre>
                  )}
                </>
              ) : null}
            </div>
          </div>
        ) : null}
    </Card>
  );
}


/** Empty = installation accent; the picker and the hex field stay in sync. */
function AccentColorField({
  value,
  disabled,
  onChange,
}: {
  readonly value: string;
  readonly disabled: boolean;
  readonly onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const valid = text === "" || colourPattern.test(text);
  return (
    <Field
      label={t("settings.emailTemplates.fields.accentColor")}
      hint={t("settings.emailTemplates.hints.accentColor")}
    >
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={t("settings.emailTemplates.fields.accentColor")}
          className="h-9 w-12 cursor-pointer rounded-md border border-border bg-surface p-1 disabled:opacity-45"
          value={colourPattern.test(value) ? value : "#4f46e5"}
          disabled={disabled}
          data-testid="email-template-field-accentColor-picker"
          onChange={(event) => onChange(event.target.value)}
        />
        <Input
          className="w-32 font-mono"
          value={text}
          placeholder={t("settings.emailTemplates.accentInherit")}
          disabled={disabled}
          aria-invalid={!valid}
          data-testid="email-template-field-accentColor"
          onChange={(event) => {
            setText(event.target.value);
            if (event.target.value === "" || colourPattern.test(event.target.value)) {
              onChange(event.target.value);
            }
          }}
        />
        <Button
          type="button"
          size="xs"
          variant="ghost"
          disabled={disabled || value === ""}
          onClick={() => onChange("")}
        >
          <Palette size={13} />
          {t("settings.emailTemplates.accentUseGlobal")}
        </Button>
      </div>
      {!valid ? (
        <span className="mt-1 block text-[11.5px] text-danger" role="alert">
          {t("settings.emailTemplates.accentInvalid")}
        </span>
      ) : null}
    </Field>
  );
}

function describeError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : String(error);
}

