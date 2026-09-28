import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { errorTextClassName, hintClassName } from "@/components/ui/control";
import { Field, Select, Textarea } from "@/components/ui/field";
import { Modal, ModalContent, ModalFooter, ModalHeader } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { mapApiError } from "@/lib/map-api-error";
import { localizedIncidentTitle, mapStatusError, nextIncidentStatuses } from "@/lib/status/status-view";
import {
  getResolvePreview,
  postIncidentUpdate,
  type Incident,
  type IncidentStatus,
  type ResolvePreview,
} from "@/services/status-api";

interface IncidentUpdateDialogProperties {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly incident: Incident;
  /** Opened from "Resolve": starts on RESOLVED. */
  readonly initialStatus?: IncidentStatus;
  readonly onSaved: () => void;
}

/**
 * Paket 2.7 (§8.3): a timeline entry. Choosing RESOLVED shows how many
 * people will be told (subscribers + requesters of linked tickets) before
 * the operator confirms; the notice is in-app only.
 */
export function IncidentUpdateDialog({ open, onOpenChange, incident, initialStatus, onSaved }: IncidentUpdateDialogProperties) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const options = nextIncidentStatuses(incident.status);
  const [status, setStatus] = useState<IncidentStatus>(incident.status);
  const [message, setMessage] = useState("");
  const [notify, setNotify] = useState(true);
  const [preview, setPreview] = useState<ResolvePreview | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resolving = status === "RESOLVED";

  useEffect(() => {
    if (!open) return;
    setStatus(initialStatus ?? incident.status);
    setMessage("");
    setNotify(true);
    setPreview(null);
    setPreviewFailed(false);
    setError(null);
  }, [open, initialStatus, incident.status]);

  useEffect(() => {
    if (!open || !resolving || preview !== null) return;
    let active = true;
    getResolvePreview(incident.id)
      .then((loaded) => {
        if (active) setPreview(loaded);
      })
      .catch(() => {
        if (active) setPreviewFailed(true);
      });
    return () => {
      active = false;
    };
  }, [open, resolving, preview, incident.id]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (message.trim().length < 3 || saving) return;
    setSaving(true);
    setError(null);
    try {
      const result = await postIncidentUpdate(incident.id, {
        status,
        message: message.trim(),
        ...(resolving ? { notifyOnResolve: notify } : {}),
      });
      toast({
        tone: "success",
        title: resolving ? t("status.update.resolved") : t("status.update.posted"),
        description: resolving && notify ? t("status.update.notified", { count: result.notified }) : undefined,
      });
      onOpenChange(false);
      onSaved();
    } catch (caught) {
      setError(t(mapStatusError(caught) ?? mapApiError(caught)));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onOpenChange={(next) => (saving ? undefined : onOpenChange(next))}>
      <ModalContent className="max-w-lg">
        <ModalHeader
          title={resolving ? t("status.update.resolveTitle") : t("status.update.title")}
          description={localizedIncidentTitle(incident, i18n.language)}
        />
        <form className="grid gap-3" onSubmit={(event) => void submit(event)}>
          <Field label={t("status.update.status")} required>
            <Select value={status} onChange={(event) => setStatus(event.target.value as IncidentStatus)}>
              {options.map((value) => (
                <option key={value} value={value}>
                  {t(`status.status.${value}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={t("status.update.message")}
            required
            hint={resolving ? t("status.update.resolveMessageHint") : t("status.update.messageHint")}
          >
            <Textarea rows={5} value={message} maxLength={4000} onChange={(event) => setMessage(event.target.value)} autoFocus />
          </Field>
          {resolving ? (
            <div className="grid gap-1.5 rounded-md border border-border bg-elevated/40 p-3">
              <Checkbox
                checked={notify}
                onChange={(event) => setNotify(event.target.checked)}
                label={<span className="text-[12.5px] font-medium text-foreground">{t("status.update.notify")}</span>}
              />
              <span className={`pl-6 ${hintClassName}`}>
                {previewFailed
                  ? t("status.update.previewFailed")
                  : preview === null
                    ? t("status.loading")
                    : t("status.update.preview", {
                        recipients: preview.recipients,
                        subscribers: preview.subscribers,
                        requesters: preview.requesters,
                      })}
              </span>
              {preview !== null && preview.linkedTickets > 0 ? (
                <span className={`pl-6 ${hintClassName}`}>{t("status.update.previewTickets", { count: preview.linkedTickets })}</span>
              ) : null}
            </div>
          ) : null}
          {error ? (
            <p role="alert" className={errorTextClassName}>
              {error}
            </p>
          ) : null}
          <ModalFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
              {t("status.cancel")}
            </Button>
            <Button type="submit" disabled={message.trim().length < 3 || saving}>
              {saving ? t("status.saving") : resolving ? t("status.update.resolveSubmit") : t("status.update.submit")}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
}
