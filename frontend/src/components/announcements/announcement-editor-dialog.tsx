import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { MarkdownView } from "@/components/privacy/markdown-view";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { errorTextClassName, hintClassName } from "@/components/ui/control";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Modal, ModalContent, ModalFooter, ModalHeader } from "@/components/ui/modal";
import {
  announcementErrorDetail,
  fromLocalInputValue,
  mapAnnouncementError,
  toLocalInputValue,
} from "@/lib/announcements/announcement-view";
import { mapApiError } from "@/lib/map-api-error";
import {
  createAnnouncement,
  previewAnnouncementAudience,
  updateAnnouncement,
  type AnnouncementDisplayMode,
  type AnnouncementOptions,
  type AnnouncementSeverity,
  type AnnouncementWriteInput,
  type ManagedAnnouncement,
} from "@/services/announcements-api";

const roleKeys = ["USER", "AGENT", "ADMIN", "SUPER_ADMIN"] as const;
const roleLabelKeys = {
  USER: "announcements.roles.USER",
  AGENT: "announcements.roles.AGENT",
  ADMIN: "announcements.roles.ADMIN",
  SUPER_ADMIN: "announcements.roles.SUPER_ADMIN",
} as const;
const severityKeys = {
  INFO: "announcements.severity.INFO",
  WARNING: "announcements.severity.WARNING",
  CRITICAL: "announcements.severity.CRITICAL",
} as const;
const hourMs = 3_600_000;

type Draft = {
  title: string;
  body: string;
  severity: AnnouncementSeverity;
  displayMode: AnnouncementDisplayMode;
  requiresAcknowledgement: boolean;
  notifyAudience: boolean;
  sendEmail: boolean;
  postToTeams: boolean;
  startsAt: string;
  endsAt: string;
  serviceId: string;
  roles: string[];
  organizationalUnitIds: string[];
  groupIds: string[];
};

function emptyDraft(): Draft {
  const start = new Date(Math.ceil(Date.now() / (15 * 60_000)) * 15 * 60_000);
  return {
    title: "",
    body: "",
    severity: "INFO",
    displayMode: "BANNER",
    requiresAcknowledgement: false,
    notifyAudience: false,
    sendEmail: false,
    postToTeams: false,
    startsAt: toLocalInputValue(start),
    endsAt: toLocalInputValue(new Date(start.getTime() + 7 * 24 * hourMs)),
    serviceId: "",
    roles: [],
    organizationalUnitIds: [],
    groupIds: [],
  };
}

function draftOf(announcement: ManagedAnnouncement): Draft {
  return {
    title: announcement.title,
    body: announcement.body,
    severity: announcement.severity,
    displayMode: announcement.displayMode,
    requiresAcknowledgement: announcement.requiresAcknowledgement,
    notifyAudience: announcement.notifyAudience,
    sendEmail: announcement.sendEmail,
    postToTeams: announcement.postToTeams,
    startsAt: toLocalInputValue(announcement.startsAt),
    endsAt: toLocalInputValue(announcement.endsAt),
    serviceId: announcement.serviceId ?? "",
    roles: [...announcement.roles],
    organizationalUnitIds: [...announcement.organizationalUnitIds],
    groupIds: [...announcement.groupIds],
  };
}

function toggle(values: readonly string[], value: string, on: boolean): string[] {
  return on ? [...new Set([...values, value])] : values.filter((item) => item !== value);
}

interface AnnouncementEditorDialogProperties {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly options: AnnouncementOptions;
  /** null = new announcement. */
  readonly announcement: ManagedAnnouncement | null;
  readonly onSaved: (saved: ManagedAnnouncement) => void;
}

/**
 * Paket 2.9 (K2, §3.3): editor with a live preview and the audience estimate.
 * A published announcement keeps its audience and acknowledgement mode (the
 * report counts against the audience captured at publication).
 */
export function AnnouncementEditorDialog({ open, onOpenChange, options, announcement, onSaved }: AnnouncementEditorDialogProperties) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [preview, setPreview] = useState(false);
  const [audienceCount, setAudienceCount] = useState<number | null>(null);
  const [audienceError, setAudienceError] = useState(false);
  const [unitFilter, setUnitFilter] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPublished = announcement !== null && announcement.status === "PUBLISHED";
  const hasStarted = isPublished && Date.parse(announcement.startsAt) <= Date.now();

  useEffect(() => {
    if (!open) return;
    setDraft(announcement === null ? emptyDraft() : draftOf(announcement));
    setPreview(false);
    setError(null);
    setUnitFilter("");
  }, [open, announcement]);

  const audienceKey = `${draft.roles.join(",")}|${draft.organizationalUnitIds.join(",")}|${draft.groupIds.join(",")}`;
  useEffect(() => {
    if (!open) return;
    if (options.scopedToUnit && draft.organizationalUnitIds.length === 0) {
      setAudienceCount(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      previewAnnouncementAudience({ roles: draft.roles, organizationalUnitIds: draft.organizationalUnitIds, groupIds: draft.groupIds })
        .then((result) => {
          if (!cancelled) {
            setAudienceCount(result.count);
            setAudienceError(false);
          }
        })
        .catch(() => {
          if (!cancelled) setAudienceError(true);
        });
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // audienceKey stands for the three audience arrays.
  }, [open, audienceKey, options.scopedToUnit]);

  const visibleUnits = useMemo(() => {
    const needle = unitFilter.trim().toLowerCase();
    return needle.length === 0
      ? options.organizationalUnits
      : options.organizationalUnits.filter((unit) => `${unit.name} ${unit.path}`.toLowerCase().includes(needle));
  }, [options.organizationalUnits, unitFilter]);

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((previous) => ({ ...previous, [key]: value }));

  const save = async () => {
    const startsAt = fromLocalInputValue(draft.startsAt);
    const endsAt = fromLocalInputValue(draft.endsAt);
    if (startsAt === null || endsAt === null) {
      setError(t("announcements.errors.dates"));
      return;
    }
    if (Date.parse(endsAt) <= Date.parse(startsAt)) {
      setError(t("announcements.errors.order"));
      return;
    }
    const input: AnnouncementWriteInput = {
      title: draft.title.trim(),
      body: draft.body.trim(),
      severity: draft.severity,
      displayMode: draft.requiresAcknowledgement ? draft.displayMode : "BANNER",
      requiresAcknowledgement: draft.requiresAcknowledgement,
      notifyAudience: draft.notifyAudience,
      sendEmail: draft.notifyAudience && draft.sendEmail && options.emailAvailable,
      postToTeams: draft.postToTeams && options.teamsAvailable,
      startsAt,
      endsAt,
      serviceId: draft.serviceId.length === 0 ? null : draft.serviceId,
      roles: draft.roles,
      organizationalUnitIds: draft.organizationalUnitIds,
      groupIds: draft.groupIds,
    };
    setSaving(true);
    setError(null);
    try {
      const saved = announcement === null ? await createAnnouncement(input) : await updateAnnouncement(announcement.id, input);
      onSaved(saved);
    } catch (caught) {
      const detail = announcementErrorDetail(caught);
      if (detail !== null && detail.startsWith("duration:")) {
        setError(t("announcements.errors.duration", { days: Number(detail.slice("duration:".length)) }));
      } else {
        setError(t(mapAnnouncementError(caught) ?? mapApiError(caught)));
      }
    } finally {
      setSaving(false);
    }
  };

  const canSave =
    draft.title.trim().length >= 3 &&
    draft.body.trim().length > 0 &&
    (!options.scopedToUnit || draft.organizationalUnitIds.length > 0) &&
    !saving;

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent className="max-w-3xl">
        <ModalHeader
          title={announcement === null ? t("announcements.editor.createTitle") : t("announcements.editor.editTitle")}
          description={isPublished ? t("announcements.editor.publishedHint") : t("announcements.editor.description")}
        />
        <div className="grid max-h-[68vh] gap-4 overflow-y-auto pr-1">
          <Field label={t("announcements.editor.title")} required>
            {(control) => (
              <Input {...control} value={draft.title} maxLength={120} onChange={(event) => update("title", event.target.value)} />
            )}
          </Field>
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12.5px] font-medium text-foreground">
                {t("announcements.editor.body")}
                <span className="text-danger" aria-hidden="true">
                  *
                </span>
              </span>
              <Button variant="ghost" size="xs" aria-pressed={preview} onClick={() => setPreview((value) => !value)}>
                {preview ? t("announcements.editor.edit") : t("announcements.editor.preview")}
              </Button>
            </div>
            {preview ? (
              <div className="min-h-[120px] rounded-md border border-border bg-elevated/40 p-3">
                <MarkdownView source={draft.body} className="grid gap-2 text-[12.5px] leading-5 text-foreground" />
              </div>
            ) : (
              <Textarea
                aria-label={t("announcements.editor.body")}
                aria-required
                rows={6}
                value={draft.body}
                maxLength={4000}
                onChange={(event) => update("body", event.target.value)}
              />
            )}
            <span className={hintClassName}>{t("announcements.editor.bodyHint")}</span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("announcements.editor.severity")}>
              {(control) => (
                <Select {...control} value={draft.severity} onChange={(event) => update("severity", event.target.value as AnnouncementSeverity)}>
                  {(["INFO", "WARNING", "CRITICAL"] as const).map((severity) => (
                    <option key={severity} value={severity}>
                      {t(severityKeys[severity])}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t("announcements.editor.service")} hint={t("announcements.editor.serviceHint")}>
              {(control) => (
                <Select {...control} value={draft.serviceId} onChange={(event) => update("serviceId", event.target.value)}>
                  <option value="">{t("announcements.editor.noService")}</option>
                  {options.services.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t("announcements.editor.startsAt")} required>
              {(control) => (
                <Input
                  {...control}
                  type="datetime-local"
                  value={draft.startsAt}
                  disabled={hasStarted}
                  onChange={(event) => update("startsAt", event.target.value)}
                />
              )}
            </Field>
            <Field label={t("announcements.editor.endsAt")} required hint={t("announcements.editor.maxDuration", { days: options.maxDurationDays })}>
              {(control) => (
                <Input {...control} type="datetime-local" value={draft.endsAt} onChange={(event) => update("endsAt", event.target.value)} />
              )}
            </Field>
          </div>

          <fieldset className="grid gap-2.5">
            <legend className="mb-1 text-[12.5px] font-medium text-foreground">{t("announcements.editor.behaviour")}</legend>
            <Checkbox
              label={t("announcements.editor.requiresAcknowledgement")}
              checked={draft.requiresAcknowledgement}
              disabled={isPublished}
              onChange={(event) => {
                const checked = event.target.checked;
                setDraft((previous) => ({ ...previous, requiresAcknowledgement: checked, displayMode: checked ? previous.displayMode : "BANNER" }));
              }}
            />
            <Field label={t("announcements.editor.displayMode")} hint={t("announcements.editor.displayModeHint")}>
              {(control) => (
                <Select
                  {...control}
                  value={draft.requiresAcknowledgement ? draft.displayMode : "BANNER"}
                  disabled={!draft.requiresAcknowledgement}
                  onChange={(event) => update("displayMode", event.target.value as AnnouncementDisplayMode)}
                >
                  <option value="BANNER">{t("announcements.displayMode.BANNER")}</option>
                  <option value="MODAL">{t("announcements.displayMode.MODAL")}</option>
                </Select>
              )}
            </Field>
            <Checkbox
              label={t("announcements.editor.notifyAudience")}
              checked={draft.notifyAudience}
              onChange={(event) => update("notifyAudience", event.target.checked)}
            />
            <div className="grid gap-1 pl-6">
              <Checkbox
                label={t("announcements.editor.sendEmail")}
                checked={draft.notifyAudience && draft.sendEmail && options.emailAvailable}
                disabled={!draft.notifyAudience || !options.emailAvailable}
                onChange={(event) => update("sendEmail", event.target.checked)}
              />
              <p className={hintClassName}>
                {options.emailAvailable ? t("announcements.editor.sendEmailHint") : t("announcements.editor.sendEmailUnavailable")}
              </p>
            </div>
            {options.teamsAvailable ? (
              <div className="grid gap-1">
                <Checkbox
                  label={t("announcements.editor.postToTeams")}
                  checked={draft.postToTeams}
                  disabled={announcement !== null && announcement.teamsPostedAt !== null}
                  onChange={(event) => update("postToTeams", event.target.checked)}
                />
                <p className={hintClassName}>
                  {announcement !== null && announcement.teamsPostedAt !== null
                    ? t("announcements.editor.postToTeamsDone")
                    : t("announcements.editor.postToTeamsHint")}
                </p>
              </div>
            ) : null}
          </fieldset>

          <fieldset className="grid gap-3" disabled={isPublished}>
            <legend className="mb-1 text-[12.5px] font-medium text-foreground">{t("announcements.editor.audience")}</legend>
            <p className={hintClassName}>
              {options.scopedToUnit ? t("announcements.editor.audienceScopedHint") : t("announcements.editor.audienceHint")}
            </p>
            <div className="grid gap-1.5">
              <span className="text-[12px] font-medium text-muted-foreground">{t("announcements.editor.roles")}</span>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {roleKeys.map((role) => (
                  <Checkbox
                    key={role}
                    label={t(roleLabelKeys[role])}
                    checked={draft.roles.includes(role)}
                    onChange={(event) => update("roles", toggle(draft.roles, role, event.target.checked))}
                  />
                ))}
              </div>
            </div>
            <div className="grid gap-1.5">
              <span className="text-[12px] font-medium text-muted-foreground">
                {t("announcements.editor.units")} ({draft.organizationalUnitIds.length})
              </span>
              <Input
                aria-label={t("announcements.editor.unitFilter")}
                placeholder={t("announcements.editor.unitFilter")}
                value={unitFilter}
                onChange={(event) => setUnitFilter(event.target.value)}
              />
              <div className="grid max-h-40 gap-2 overflow-y-auto rounded-md border border-border p-2.5">
                {visibleUnits.length === 0 ? (
                  <span className={hintClassName}>{t("announcements.editor.noUnits")}</span>
                ) : (
                  visibleUnits.map((unit) => (
                    <Checkbox
                      key={unit.id}
                      label={
                        <span>
                          {unit.name} <span className="text-[11px] text-muted-foreground">{unit.path}</span>
                        </span>
                      }
                      checked={draft.organizationalUnitIds.includes(unit.id)}
                      onChange={(event) => update("organizationalUnitIds", toggle(draft.organizationalUnitIds, unit.id, event.target.checked))}
                    />
                  ))
                )}
              </div>
              <span className={hintClassName}>{t("announcements.editor.unitsHint")}</span>
            </div>
            {options.groups.length > 0 ? (
              <div className="grid gap-1.5">
                <span className="text-[12px] font-medium text-muted-foreground">
                  {t("announcements.editor.groups")} ({draft.groupIds.length})
                </span>
                <div className="grid max-h-32 gap-2 overflow-y-auto rounded-md border border-border p-2.5">
                  {options.groups.map((group) => (
                    <Checkbox
                      key={group.id}
                      label={group.name}
                      checked={draft.groupIds.includes(group.id)}
                      onChange={(event) => update("groupIds", toggle(draft.groupIds, group.id, event.target.checked))}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </fieldset>
          <p className="text-[12.5px] text-foreground" aria-live="polite">
            {audienceError
              ? t("announcements.editor.audienceUnknown")
              : audienceCount === null
                ? t("announcements.editor.audiencePending")
                : t("announcements.editor.audienceCount", { count: audienceCount })}
          </p>
          {error ? (
            <p role="alert" className={errorTextClassName}>
              {error}
            </p>
          ) : null}
        </div>
        <ModalFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("ui.cancel")}
          </Button>
          <Button onClick={() => void save()} disabled={!canSave}>
            {announcement === null ? t("announcements.editor.saveDraft") : t("announcements.editor.save")}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
