import { useTranslation } from "react-i18next";
import { CreateTicketSeverityFields } from "@/components/tickets/create-ticket-severity-fields";
import { ServiceFormFields } from "@/components/tickets/service-form-fields";
import {
  controlClassName,
  hintClassName,
  labelClassName,
  selectClassName,
  textareaClassName,
} from "@/components/ui/control";
import type { CreateTicketDraft } from "@/lib/tickets/build-create-ticket-input";
import type { OriginUnitOption } from "@/lib/tickets/ticket-display";
import type { FormVersionResponse, ServiceResponse } from "@/services/service-catalog-api";
import type { TicketImpact, TicketPriority } from "@/services/tickets-api";

interface CreateTicketFieldsProperties {
  readonly draft: CreateTicketDraft;
  readonly originUnits: readonly OriginUnitOption[];
  readonly canChooseOriginUnit: boolean;
  readonly originUnitDisplayName: string;
  readonly selectedService: ServiceResponse | null;
  readonly activeForm: FormVersionResponse | null;
  readonly fieldErrors: ReadonlyMap<string, string>;
  readonly suggestedPriority: TicketPriority;
  readonly onChange: (draft: CreateTicketDraft) => void;
  readonly onOriginUnitChosen?: () => void;
}

export function CreateTicketFields({
  draft,
  originUnits,
  canChooseOriginUnit,
  originUnitDisplayName,
  selectedService,
  activeForm,
  fieldErrors,
  suggestedPriority,
  onChange,
  onOriginUnitChosen,
}: CreateTicketFieldsProperties) {
  const { t } = useTranslation();
  return (
    <div className="p-5">
      <h2 className="text-[14px] font-semibold text-foreground">
        {t("tickets.createStepDetails")}
        {selectedService ? ` — ${selectedService.name}` : ""}
      </h2>
      {canChooseOriginUnit ? (
        <p className="mt-0.5 text-[12px] text-muted-foreground">{t("tickets.originUnitHint")}</p>
      ) : null}
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className={`${labelClassName} md:col-span-2`}>
          <span>
            {t("tickets.titleField")}
            <span className="text-danger"> *</span>
          </span>
          <input
            className={controlClassName}
            value={draft.title}
            onChange={(event) => onChange({ ...draft, title: event.target.value })}
            required
            placeholder={t("tickets.titleField")}
          />
        </label>
        {canChooseOriginUnit ? (
          <label className={labelClassName}>
            <span>
              {t("tickets.originUnit")}
              <span className="text-danger"> *</span>
            </span>
            <select
              className={selectClassName}
              value={draft.originUnitId}
              onChange={(event) => {
                onOriginUnitChosen?.();
                onChange({ ...draft, originUnitId: event.target.value });
              }}
              required
            >
              <option value="">{t("tickets.originUnitPlaceholder")}</option>
              {originUnits.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className={`${hintClassName} md:col-span-2`}>
            {t("tickets.originUnitYours", {
              name: originUnitDisplayName || t("tickets.originUnitMissing"),
            })}
          </p>
        )}
        <label className={`${labelClassName} md:col-span-2`}>
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
          <div className="grid gap-2 md:col-span-2">
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
          <div role="alert" className="rounded-lg border border-danger/35 bg-danger/10 px-3 py-2.5 md:col-span-2">
            <p className="text-[12.5px] font-medium text-danger">{t("tickets.noActiveForm")}</p>
            <p className={`mt-0.5 ${hintClassName}`}>{t("tickets.noActiveFormHint")}</p>
          </div>
        ) : null}
      </div>
      <CreateTicketSeverityFields
        impact={draft.impact}
        urgency={draft.urgency}
        suggestedPriority={suggestedPriority}
        onImpactChange={(impact: TicketImpact) => onChange({ ...draft, impact })}
        onUrgencyChange={(urgency: TicketImpact) => onChange({ ...draft, urgency })}
      />
    </div>
  );
}
