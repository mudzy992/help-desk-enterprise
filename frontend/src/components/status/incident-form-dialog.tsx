import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { errorTextClassName, hintClassName } from "@/components/ui/control";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Modal, ModalContent, ModalFooter, ModalHeader } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useOperationGuard } from "@/lib/async/use-operation-guard";
import { mapApiError, readApiRequestId } from "@/lib/map-api-error";
import { queryKeys } from "@/lib/query/query-keys";
import { mapStatusError } from "@/lib/status/status-view";
import {
  browserTimeZone,
  fromDatetimeLocalValue,
  toDatetimeLocalValue,
} from "@/lib/services/downtime-datetime";
import { listServices } from "@/services/service-catalog-api";
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

/**
 * Shared dialog for "New incident" on /status, "Create
 * incident from selected" in the ticket list and editing an open incident.
 */
export function IncidentFormDialog({
  open,
  onOpenChange,
  mode,
  onSaved,
}: IncidentFormDialogProperties) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const editing = mode.kind === "edit" ? mode.incident : null;
  const presetServiceIds = mode.kind === "create" ? mode.presetServiceIds : undefined;
  const ticketIds = mode.kind === "create" ? (mode.ticketIds ?? []) : [];
  const operationGuard = useOperationGuard();
  const servicesQuery = useQuery({
    queryKey: queryKeys.statusIncidentServices,
    queryFn: listServices,
    enabled: open,
    retry: false,
  });
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
  const [currentMinute, setCurrentMinute] = useState(() => new Date());

  useEffect(() => {
    if (!open) return;
    setCurrentMinute(new Date());
    const timer = window.setInterval(() => setCurrentMinute(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, [open]);

  // Reset on every open so a cancelled draft never leaks into the next incident.
  useEffect(() => {
    if (!open) return;
    setTitle(editing?.title ?? "");
    setTitleEn(editing?.titleEn ?? "");
    setImpact(editing?.impact ?? "DEGRADED");
    setVisibility(editing?.visibility ?? "ALL_USERS");
    setServiceIds(
      editing?.services.map((service) => service.id) ??
        (mode.kind === "create" ? [...(presetServiceIds ?? [])] : []),
    );
    setServiceFilter("");
    setMessage("");
    setStartedAt("");
    setNotify(false);
    setError(null);
  }, [
    open,
    editing?.title,
    editing?.titleEn,
    editing?.impact,
    editing?.visibility,
    editing?.services,
    mode.kind,
    presetServiceIds,
  ]);

  const services = useMemo(
    () =>
      servicesQuery.data?.filter(
        (service) => service.lifecycle === "ACTIVE" || serviceIds.includes(service.id),
      ) ?? null,
    [serviceIds, servicesQuery.data],
  );
  const filtered = useMemo(() => {
    const query = serviceFilter.trim().toLocaleLowerCase();
    const list = services ?? [];
    return query.length === 0
      ? list
      : list.filter((service) => service.name.toLocaleLowerCase().includes(query));
  }, [services, serviceFilter]);

  const toggleService = (serviceId: string) =>
    setServiceIds((current) =>
      current.includes(serviceId)
        ? current.filter((id) => id !== serviceId)
        : [...current, serviceId],
    );

  const startedAtInstant = startedAt.length === 0 ? null : fromDatetimeLocalValue(startedAt);
  const valid =
    title.trim().length >= 3 &&
    serviceIds.length > 0 &&
    (editing !== null || message.trim().length >= 3) &&
    (startedAt.length === 0 ||
      (startedAtInstant !== null && Date.parse(startedAtInstant) <= currentMinute.getTime()));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid || saving || operationGuard.isPending("save")) return;
    await operationGuard.run("save", async () => {
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
            ...(startedAtInstant !== null ? { startedAt: startedAtInstant } : {}),
            notifyOpenTicketHolders: visibility === "ALL_USERS" && notify,
            ...(ticketIds.length > 0 ? { ticketIds } : {}),
          });
          toast({
            tone: "success",
            title: t("status.form.created"),
            description:
              [
                ticketIds.length > 0
                  ? t("status.form.createdLinked", { count: ticketIds.length })
                  : null,
                visibility === "ALL_USERS" && notify
                  ? t("status.form.createdNotified", { count: result.notified })
                  : null,
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
    });
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
        <form
          className="grid max-h-[70vh] gap-3 overflow-y-auto pr-1"
          onSubmit={(event) => void submit(event)}
        >
          <Field label={t("status.form.title")} required>
            {(control) => (
              <Input
                {...control}
                value={title}
                maxLength={titleMax}
                onChange={(event) => setTitle(event.target.value)}
                autoFocus
              />
            )}
          </Field>
          <Field label={t("status.form.titleEn")} hint={t("status.form.titleEnHint")}>
            {(control) => (
              <Input
                {...control}
                value={titleEn}
                maxLength={titleMax}
                onChange={(event) => setTitleEn(event.target.value)}
              />
            )}
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("status.form.impact")} required>
              {(control) => (
                <Select
                  {...control}
                  value={impact}
                  onChange={(event) => setImpact(event.target.value as IncidentImpact)}
                >
                  {incidentImpacts.map((value) => (
                    <option key={value} value={value}>
                      {t(`status.impact.${value}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field
              label={t("status.form.visibility")}
              required
              hint={t(`status.visibilityHint.${visibility}`)}
            >
              {(control) => (
                <Select
                  {...control}
                  value={visibility}
                  onChange={(event) => setVisibility(event.target.value as IncidentVisibility)}
                >
                  {incidentVisibilities.map((value) => (
                    <option key={value} value={value}>
                      {t(`status.visibility.${value}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <div>
            <span className="mb-1.5 flex items-baseline gap-1 text-[12.5px] font-medium text-foreground">
              {t("status.form.services")}
              <span className="text-danger">*</span>
              <span className={hintClassName}>
                · {t("status.form.servicesSelected", { count: serviceIds.length })}
              </span>
            </span>
            <Input
              value={serviceFilter}
              onChange={(event) => setServiceFilter(event.target.value)}
              placeholder={t("status.form.servicesFilter")}
              aria-label={t("status.form.servicesFilter")}
            />
            <div className="mt-2 grid max-h-44 gap-2 overflow-y-auto rounded-md border border-border p-2.5">
              {servicesQuery.error !== null && services === null ? (
                <div className="grid gap-2">
                  <span className={errorTextClassName} role="alert">
                    {t("status.form.servicesFailed")}
                    {readApiRequestId(servicesQuery.error)
                      ? ` · ${t("errors.requestId", { requestId: readApiRequestId(servicesQuery.error) })}`
                      : ""}
                  </span>
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() => void servicesQuery.refetch()}
                  >
                    {t("ui.retry")}
                  </Button>
                </div>
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
                {(control) => (
                  <Textarea
                    {...control}
                    rows={4}
                    value={message}
                    maxLength={messageMax}
                    onChange={(event) => setMessage(event.target.value)}
                  />
                )}
              </Field>
              <Field
                label={t("status.form.startedAt")}
                hint={t("status.form.startedAtHint", { timeZone: browserTimeZone() })}
              >
                {(control) => (
                  <Input
                    {...control}
                    type="datetime-local"
                    value={startedAt}
                    max={toDatetimeLocalValue(currentMinute)}
                    onChange={(event) => setStartedAt(event.target.value)}
                  />
                )}
              </Field>
              {visibility === "ALL_USERS" ? (
                <div className="grid gap-1">
                  <Checkbox
                    checked={notify}
                    onChange={(event) => setNotify(event.target.checked)}
                    label={
                      <span className="text-[12.5px] text-foreground">
                        {t("status.form.notify")}
                      </span>
                    }
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
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              {t("status.cancel")}
            </Button>
            <Button type="submit" disabled={!valid || saving}>
              {saving
                ? t("status.saving")
                : editing === null
                  ? t("status.form.createSubmit")
                  : t("status.form.saveSubmit")}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
}
