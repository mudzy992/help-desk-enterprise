import { useTranslation } from "react-i18next";
import { ServiceFormFields } from "@/components/tickets/service-form-fields";
import type { CreateTicketDraft } from "@/lib/tickets/build-create-ticket-input";
import { ticketPriorityValues } from "@/lib/tickets/ticket-constants";
import type {
  FormVersionResponse,
  ServiceResponse,
} from "@/services/service-catalog-api";
import type { TicketImpact } from "@/services/tickets-api";

const fieldClass =
  "h-9 rounded-md border border-input bg-surface px-2 text-body focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

interface CreateTicketFieldsProperties {
  readonly draft: CreateTicketDraft;
  readonly services: readonly ServiceResponse[];
  readonly selectedService: ServiceResponse | null;
  readonly activeForm: FormVersionResponse | null;
  readonly fieldErrors: ReadonlyMap<string, string>;
  readonly onChange: (draft: CreateTicketDraft) => void;
}

export function CreateTicketFields({
  draft,
  services,
  selectedService,
  activeForm,
  fieldErrors,
  onChange,
}: CreateTicketFieldsProperties) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-4">
      <label className="grid gap-1 text-body">
        {t("tickets.service")}
        <select
          className={fieldClass}
          value={draft.serviceId}
          onChange={(event) =>
            onChange({
              ...draft,
              serviceId: event.target.value,
              formData: event.target.value === draft.serviceId ? draft.formData : {},
              formVersionRef:
                event.target.value === draft.serviceId ? draft.formVersionRef : null,
            })
          }
          required
        >
          <option value="">{t("tickets.servicePlaceholder")}</option>
          {services.map((service) => (
            <option key={service.id} value={service.id}>
              {service.name}
            </option>
          ))}
        </select>
      </label>
      {selectedService ? (
        <div className="border border-border bg-elevated/40 px-3 py-3">
          <p className="text-metadata font-medium text-foreground">{t("tickets.context")}</p>
          <p className="mt-1 text-body text-muted-foreground">{selectedService.name}</p>
          {selectedService.runtimeAvailability.showStatusInTicketCreate &&
          selectedService.runtimeAvailability.isCurrentlyUnavailable ? (
            <p className="mt-2 text-metadata text-warning">
              {t("tickets.availabilityUnavailable")}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-body">
          {t("tickets.impact")}
          <select
            className={fieldClass}
            value={draft.impact}
            onChange={(event) =>
              onChange({ ...draft, impact: event.target.value as TicketImpact })
            }
          >
            {ticketPriorityValues.map((level) => (
              <option key={level} value={level}>
                {t(`tickets.severity.${level}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-body">
          {t("tickets.urgency")}
          <select
            className={fieldClass}
            value={draft.urgency}
            onChange={(event) =>
              onChange({ ...draft, urgency: event.target.value as TicketImpact })
            }
          >
            {ticketPriorityValues.map((level) => (
              <option key={level} value={level}>
                {t(`tickets.severity.${level}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-metadata text-muted-foreground">{t("tickets.priorityHint")}</p>
      <label className="grid gap-1 text-body">
        {t("tickets.titleField")}
        <input
          className={fieldClass}
          value={draft.title}
          onChange={(event) => onChange({ ...draft, title: event.target.value })}
          required
        />
      </label>
      <label className="grid gap-1 text-body">
        {t("tickets.descriptionField")}
        <textarea
          className="min-h-28 rounded-md border border-input bg-surface px-2 py-2 text-body focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={draft.description}
          onChange={(event) => onChange({ ...draft, description: event.target.value })}
          required
        />
      </label>
      {activeForm ? (
        <div className="grid gap-2">
          <p className="text-body font-medium">{t("tickets.formFields")}</p>
          <ServiceFormFields
            schema={activeForm.schema}
            values={draft.formData}
            errors={fieldErrors}
            onChange={(fieldId, value) =>
              onChange({ ...draft, formData: { ...draft.formData, [fieldId]: value } })
            }
          />
        </div>
      ) : selectedService ? (
        <p className="text-metadata text-muted-foreground">{t("tickets.noActiveForm")}</p>
      ) : null}
    </div>
  );
}
