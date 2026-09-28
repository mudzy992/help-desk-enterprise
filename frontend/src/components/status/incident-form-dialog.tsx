import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { errorTextClassName, hintClassName } from "@/components/ui/control";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Modal, ModalContent, ModalFooter, ModalHeader } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { mapApiError } from "@/lib/map-api-error";
import { mapStatusError } from "@/lib/status/status-view";
import { listServices, type ServiceResponse } from "@/services/service-catalog-api";
import {
  createIncident,
  editIncident,
  incidentImpacts,
  incidentVisibilities,
  type Incident,
  type IncidentImpact,
  type IncidentVisibility,
} from "@/services/status-api";

export type IncidentFormMode =
  | {
      readonly kind: "create";
      /** "Create incident from selected" / from a ticket: linked on creation. */
      readonly ticketIds?: readonly string[];
      readonly presetServiceIds?: readonly string[];
    }
  | { readonly kind: "edit"; readonly incident: Incident };

interface IncidentFormDialogProperties {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly mode: IncidentFormMode;
  readonly onSaved: () => void;
}

const titleMax = 200;
const messageMax = 4000;

/** `datetime-local` wants local time without seconds or zone. */
function toLocalInput(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Paket 2.7 (§8.3): one dialog for "New incident" on /status, "Create
 * incident from selected" in the ticket list and editing an open incident.
 */
export function IncidentFormDialog({ open, onOpenChange, mode, onSaved }: IncidentFormDialogProperties) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const editing = mode.kind === "edit" ? mode.incident : null;
  const ticketIds = mode.kind === "create" ? (mode.ticketIds ?? []) : [];
  const [services, setServices] = useState<readonly ServiceResponse[] | null>(null);
  const [servicesFailed, setServicesFailed] = useState(false);
  const [title, setTitle] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [impact, setImpact] = useState<IncidentImpact>("DEGRADED");
  const [visibility, setVisibility] = useState<IncidentVisibility>("ALL_USERS");
  const [serviceIds, setServiceIds] = useState<readonly string[]>([]);
  const [serviceFilter, setServiceFilter] = useState("");
  const [message, setMessage] = useState("");
  const [startedAt, setStartedAt] = useState("");
  const [notify, setNotify] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset on every open so a cancelled draft never leaks into the next incident.
  useEffect(() => {
    if (!open) return;
    setTitle(editing?.title ?? "");
    setTitleEn(editing?.titleEn ?? "");
    setImpact(editing?.impact ?? "DEGRADED");
    setVisibility(editing?.visibility ?? "ALL_USERS");
    setServiceIds(editing?.services.map((service) => service.id) ?? (mode.kind === "create" ? [...(mode.presetServiceIds ?? [])] : []));
    setServiceFilter("");
    setMessage("");
    setStartedAt("");
    setNotify(false);
    setError(null);
  }, [open]);

  useEffect(() => {
    if (!open || services !== null) return;
    let active = true;
    listServices()
      .then((loaded) => {
        if (active) setServices(loaded.filter((service) => service.lifecycle === "ACTIVE" || serviceIds.includes(service.id)));
      })
      .catch(() => {
        if (active) setServicesFailed(true);
      });
    return () => {
      active = false;
    };
  }, [open, services, serviceIds]);

  const filtered = useMemo(() => {
    const query = serviceFilter.trim().toLocaleLowerCase();
    const list = services ?? [];
    return query.length === 0 ? list : list.filter((service) => service.name.toLocaleLowerCase().includes(query));
  }, [services, serviceFilter]);

  const toggleService = (serviceId: string) =>
    setServiceIds((current) => (current.includes(serviceId) ? current.filter((id) => id !== serviceId) : [...current, serviceId]));

  const valid =
    title.trim().length >= 3 &&
    serviceIds.length > 0 &&
    (editing !== null || message.trim().length >= 3) &&
    (startedAt.length === 0 || new Date(startedAt).getTime() <= Date.now());

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    try {
      if (editing === null) {
        const result = await createIncident({
          title: title.trim(),
          titleEn: titleEn.trim().length > 0 ? titleEn.trim() : null,
          impact,
          visibility,
          serviceIds,
          message: message.trim(),
          ...(startedAt.length > 0 ? { startedAt: new Date(startedAt).toISOString() } : {}),
          notifyOpenTicketHolders: visibility === "ALL_USERS" && notify,
          ...(ticketIds.length > 0 ? { ticketIds } : {}),
        });
        toast({
          tone: "success",
          title: t("status.form.created"),
          description:
            [
              ticketIds.length > 0 ? t("status.form.createdLinked", { count: ticketIds.length }) : null,
              visibility === "ALL_USERS" && notify ? t("status.form.createdNotified", { count: result.notified }) : null,
            ]
              .filter((part): part is string => part !== null)
              .join(" · ") || undefined,
        });
      } else {
        await editIncident(editing.id, {
          title: title.trim(),
          titleEn: titleEn.trim().length > 0 ? titleEn.trim() : null,
          impact,
          visibility,
          serviceIds,
        });
        toast({ tone: "success", title: t("status.form.saved") });
      }
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
      <ModalContent className="max-w-xl">
        <ModalHeader
          title={editing === null ? t("status.form.createTitle") : t("status.form.editTitle")}
          description={
            editing === null
              ? ticketIds.length > 0
                ? t("status.form.createFromTickets", { count: ticketIds.length })
                : t("status.form.createDescription")
              : t("status.form.editDescription")
          }
        />
        <form className="grid max-h-[70vh] gap-3 overflow-y-auto pr-1" onSubmit={(event) => void submit(event)}>
          <Field label={t("status.form.title")} required>
            <Input value={title} maxLength={titleMax} onChange={(event) => setTitle(event.target.value)} autoFocus />
          </Field>
          <Field label={t("status.form.titleEn")} hint={t("status.form.titleEnHint")}>
            <Input value={titleEn} maxLength={titleMax} onChange={(event) => setTitleEn(event.target.value)} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("status.form.impact")} required>
              <Select value={impact} onChange={(event) => setImpact(event.target.value as IncidentImpact)}>
                {incidentImpacts.map((value) => (
                  <option key={value} value={value}>
                    {t(`status.impact.${value}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("status.form.visibility")} required hint={t(`status.visibilityHint.${visibility}`)}>
              <Select value={visibility} onChange={(event) => setVisibility(event.target.value as IncidentVisibility)}>
                {incidentVisibilities.map((value) => (
                  <option key={value} value={value}>
                    {t(`status.visibility.${value}`)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div>
            <span className="mb-1.5 flex items-baseline gap-1 text-[12.5px] font-medium text-foreground">
              {t("status.form.services")}
              <span className="text-danger">*</span>
              <span className={hintClassName}>· {t("status.form.servicesSelected", { count: serviceIds.length })}</span>
            </span>
            <Input
              value={serviceFilter}
              onChange={(event) => setServiceFilter(event.target.value)}
              placeholder={t("status.form.servicesFilter")}
              aria-label={t("status.form.servicesFilter")}
            />
            <div className="mt-2 grid max-h-44 gap-2 overflow-y-auto rounded-md border border-border p-2.5">
              {servicesFailed ? (
                <span className={errorTextClassName}>{t("status.form.servicesFailed")}</span>
              ) : services === null ? (
                <span className={hintClassName}>{t("status.loading")}</span>
              ) : filtered.length === 0 ? (
                <span className={hintClassName}>{t("status.form.servicesNone")}</span>
              ) : (
                filtered.map((service) => (
                  <Checkbox
                    key={service.id}
                    checked={serviceIds.includes(service.id)}
                    onChange={() => toggleService(service.id)}
                    label={<span className="text-[12.5px] text-foreground">{service.name}</span>}
                  />
                ))
              )}
            </div>
          </div>
          {editing === null ? (
            <>
              <Field label={t("status.form.message")} required hint={t("status.form.messageHint")}>
                <Textarea
                  rows={4}
                  value={message}
                  maxLength={messageMax}
                  onChange={(event) => setMessage(event.target.value)}
                />
              </Field>
              <Field label={t("status.form.startedAt")} hint={t("status.form.startedAtHint")}>
                <Input
                  type="datetime-local"
                  value={startedAt}
                  max={toLocalInput(new Date())}
                  onChange={(event) => setStartedAt(event.target.value)}
                />
              </Field>
              {visibility === "ALL_USERS" ? (
                <div className="grid gap-1">
                  <Checkbox
                    checked={notify}
                    onChange={(event) => setNotify(event.target.checked)}
                    label={<span className="text-[12.5px] text-foreground">{t("status.form.notify")}</span>}
                  />
                  <span className={`pl-6 ${hintClassName}`}>{t("status.form.notifyHint")}</span>
                </div>
              ) : null}
            </>
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
            <Button type="submit" disabled={!valid || saving}>
              {saving ? t("status.saving") : editing === null ? t("status.form.createSubmit") : t("status.form.saveSubmit")}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
}
