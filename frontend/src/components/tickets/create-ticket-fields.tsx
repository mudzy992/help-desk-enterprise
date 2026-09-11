import { useTranslation } from "react-i18next";
import { ServiceFormFields } from "@/components/tickets/service-form-fields";
import { controlClassName, labelClassName, textareaClassName } from "@/components/ui/control";
import type { CreateTicketDraft } from "@/lib/tickets/build-create-ticket-input";
import { ticketPriorityValues } from "@/lib/tickets/ticket-constants";
import type {
  FormVersionResponse,
  ServiceResponse,
} from "@/services/service-catalog-api";
import type { TicketImpact } from "@/services/tickets-api";

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
      <label className={labelClassName}>
        <span>
          {t("tickets.service")}
          <span className="text-danger"> *</span>
        </span>
        <select
          className={controlClassName}
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
        <div className="rounded-lg border border-border bg-elevated/40 px-3 py-3">
          <p className="text-[12.5px] font-medium text-foreground">{t("tickets.context")}</p>
          <p className="mt-1 text-[13px] text-muted-foreground">{selectedService.name}</p>
          {selectedService.runtimeAvailability.showStatusInTicketCreate &&
          selectedService.runtimeAvailability.isCurrentlyUnavailable ? (
            <p className="mt-2 text-[12px] text-warning">
              {t("tickets.availabilityUnavailable")}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelClassName}>
          {t("tickets.impact")}
          <select
            className={controlClassName}
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
        <label className={labelClassName}>
          {t("tickets.urgency")}
          <select
            className={controlClassName}
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
      <p className="text-[11.5px] text-muted-foreground">{t("tickets.priorityHint")}</p>
      <label className={labelClassName}>
        <span>
          {t("tickets.titleField")}
          <span className="text-danger"> *</span>
        </span>
        <input
          className={controlClassName}
          value={draft.title}
          onChange={(event) => onChange({ ...draft, title: event.target.value })}
          required
        />
      </label>
      <label className={labelClassName}>
        <span>
          {t("tickets.descriptionField")}
          <span className="text-danger"> *</span>
        </span>
        <textarea
          className={textareaClassName}
          value={draft.description}
          onChange={(event) => onChange({ ...draft, description: event.target.value })}
          required
        />
      </label>
      {activeForm ? (
        <div className="grid gap-2">
          <p className="text-[13.5px] font-semibold text-foreground">{t("tickets.formFields")}</p>
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
        <p className="text-[12px] text-muted-foreground">{t("tickets.noActiveForm")}</p>
      ) : null}
    </div>
  );
}
