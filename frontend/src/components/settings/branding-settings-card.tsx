import { ImageUp, Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { SettingsReasonConfirm } from "@/components/settings/settings-reason-confirm";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { mapApiError } from "@/lib/map-api-error";
import { ApiError } from "@/services/api";
import { readLogoFile, type LogoReadError } from "@/lib/branding/read-logo-file";
import { brandingSettingKeys } from "@/lib/settings/is-featured-setting-key";
import { readStringSetting } from "@/lib/settings/read-setting-entry";
import type { SettingRegistryEntry } from "@/services/settings-api";

type BrandingField = keyof typeof brandingSettingKeys;
type BrandingDraft = Record<BrandingField, string>;

const fieldOrder: readonly BrandingField[] = ["appName", "tagline", "organizationName", "logoDataUrl", "supportEmail", "supportUrl"];
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface BrandingSettingsCardProperties {
  readonly entries: readonly SettingRegistryEntry[];
  readonly canWrite: boolean;
  readonly pendingKey: string | null;
  readonly onSaveMany: (input: {
    readonly entries: readonly { readonly key: string; readonly value: string }[];
    readonly reason: string;
  }) => Promise<void>;
}

/**
 * Paket 4.1 (§3a): the client's product name, tagline, organisation, logo and
 * support contacts, with a live preview. One reason covers all changed keys.
 */
export function BrandingSettingsCard({ entries, canWrite, pendingKey, onSaveMany }: BrandingSettingsCardProperties) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const stored = useMemo<BrandingDraft>(
    () => ({
      appName: readStringSetting(entries, brandingSettingKeys.appName, "Service Desk"),
      tagline: readStringSetting(entries, brandingSettingKeys.tagline),
      organizationName: readStringSetting(entries, brandingSettingKeys.organizationName),
      logoDataUrl: readStringSetting(entries, brandingSettingKeys.logoDataUrl),
      supportEmail: readStringSetting(entries, brandingSettingKeys.supportEmail),
      supportUrl: readStringSetting(entries, brandingSettingKeys.supportUrl),
    }),
    [entries],
  );
  const [edits, setEdits] = useState<Partial<BrandingDraft>>({});
  const [logoError, setLogoError] = useState<LogoReadError | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const draft: BrandingDraft = { ...stored, ...edits };
  const changed = fieldOrder.filter((field) => draft[field].trim() !== stored[field]);
  const errors = {
    appName: draft.appName.trim().length === 0 ? t("settings.branding.required") : null,
    supportEmail: draft.supportEmail.trim().length > 0 && !emailPattern.test(draft.supportEmail.trim()) ? t("settings.branding.invalidEmail") : null,
    supportUrl: draft.supportUrl.trim().length > 0 && !/^https:\/\/\S+$/.test(draft.supportUrl.trim()) ? t("settings.branding.invalidUrl") : null,
  };
  const hasErrors = Object.values(errors).some((error) => error !== null);
  const busy = saving || (pendingKey !== null && pendingKey.startsWith("public.branding."));
  const disabled = !canWrite || busy;

  const update = (field: BrandingField, value: string) => setEdits((current) => ({ ...current, [field]: value }));

  const pickLogo = async (file: File | undefined) => {
    if (file === undefined) return;
    const result = await readLogoFile(file);
    if (result.ok) {
      setLogoError(null);
      update("logoDataUrl", result.dataUrl);
    } else {
      setLogoError(result.error);
    }
    if (fileInput.current) fileInput.current.value = "";
  };

  const save = async (reason: string) => {
    setSaving(true);
    try {
      // One all-or-nothing request: either every changed field is saved or none.
      await onSaveMany({
        entries: changed.map((field) => ({ key: brandingSettingKeys[field], value: draft[field].trim() })),
        reason,
      });
      setEdits({});
      setConfirming(false);
      toast({ tone: "success", title: t("settings.branding.saved") });
    } catch (error) {
      // Keep the draft for correction; the backend message names the failing rule.
      toast({
        tone: "danger",
        title: t(mapApiError(error)),
        description: error instanceof ApiError && error.status < 500 ? error.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="fade-in">
      <CardHeader title={t("settings.branding.title")} subtitle={t("settings.branding.subtitle")} />
      <CardBody>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t("settings.branding.appName")} required error={errors.appName}>
          {(control) => <Input {...control} value={draft.appName} maxLength={60} disabled={disabled} onChange={(event) => update("appName", event.target.value)} />}
        </Field>
        <Field label={t("settings.branding.tagline")} hint={t("settings.branding.taglineHint")}>
          {(control) => <Input {...control} value={draft.tagline} maxLength={120} disabled={disabled} onChange={(event) => update("tagline", event.target.value)} />}
        </Field>
        <Field label={t("settings.branding.organizationName")} className="sm:col-span-2">
          {(control) => <Input {...control} value={draft.organizationName} maxLength={120} disabled={disabled} onChange={(event) => update("organizationName", event.target.value)} />}
        </Field>
        <Field label={t("settings.branding.supportEmail")} error={errors.supportEmail}>
          {(control) => <Input {...control} type="email" value={draft.supportEmail} maxLength={254} disabled={disabled} placeholder="podrska@example.com" onChange={(event) => update("supportEmail", event.target.value)} />}
        </Field>
        <Field label={t("settings.branding.supportUrl")} error={errors.supportUrl}>
          {(control) => <Input {...control} type="url" value={draft.supportUrl} maxLength={500} disabled={disabled} placeholder="https://example.com/podrska" onChange={(event) => update("supportUrl", event.target.value)} />}
        </Field>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="text-[12.5px] font-medium text-foreground">{t("settings.branding.logo")}</span>
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => void pickLogo(event.target.files?.[0])}
        />
        <Button type="button" size="xs" variant="outline" disabled={disabled} onClick={() => fileInput.current?.click()}>
          <ImageUp size={13} aria-hidden="true" />
          {t("settings.branding.logoUpload")}
        </Button>
        {draft.logoDataUrl.length > 0 ? (
          <Button type="button" size="xs" variant="ghost" disabled={disabled} onClick={() => update("logoDataUrl", "")}>
            <Trash2 size={13} aria-hidden="true" />
            {t("settings.branding.logoRemove")}
          </Button>
        ) : null}
      </div>
      <p className="mt-1 text-[11.5px] text-muted-foreground">{t("settings.branding.logoHint")}</p>
      {logoError !== null ? (
        <p role="alert" className="mt-1 text-[12.5px] text-danger">
          {t(`settings.branding.${logoError}`)}
        </p>
      ) : null}

      <div className="mt-4 rounded-lg border border-border bg-background p-3" aria-label={t("settings.branding.preview")}>
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{t("settings.branding.preview")}</p>
        <div className="mt-2 flex items-center gap-2.5">
          {draft.logoDataUrl.length > 0 ? (
            <span className="pulse-gradient flex size-8 shrink-0 overflow-hidden rounded-[11px]">
              <img src={draft.logoDataUrl} alt="" className="size-full object-contain" />
            </span>
          ) : (
            <span className="pulse-gradient size-8 shrink-0 rounded-[11px]" aria-hidden="true" />
          )}
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[14px] font-semibold tracking-[-0.02em] text-foreground">{draft.appName.trim() || "Service Desk"}</p>
            <p className="truncate text-[10.5px] text-muted-foreground">{draft.tagline.trim() || t("shell.brandTagline")}</p>
          </div>
        </div>
        {draft.organizationName.trim() || draft.supportEmail.trim() || draft.supportUrl.trim() ? (
          <p className="mt-2 truncate text-[11.5px] text-muted-foreground">
            {[draft.organizationName.trim(), draft.supportEmail.trim(), draft.supportUrl.trim()].filter(Boolean).join(" · ")}
          </p>
        ) : null}
        <p className="mt-2 text-[11.5px] text-muted-foreground">{t("settings.branding.previewHint")}</p>
      </div>

      {canWrite ? (
        confirming ? (
          <SettingsReasonConfirm pending={busy} onConfirm={save} onCancel={() => setConfirming(false)} />
        ) : (
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
            {changed.length > 0 ? (
              <Button type="button" size="xs" variant="ghost" disabled={busy} onClick={() => setEdits({})}>
                {t("settings.branding.reset")}
              </Button>
            ) : null}
            <Button type="button" size="xs" variant="primary" disabled={busy || hasErrors || changed.length === 0} onClick={() => setConfirming(true)}>
              {t("settings.branding.save")}
            </Button>
          </div>
        )
      ) : null}
      </CardBody>
    </Card>
  );
}
