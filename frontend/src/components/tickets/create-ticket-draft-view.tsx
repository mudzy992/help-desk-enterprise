import { type FormEvent } from "react";
import { CreateTicketFields } from "@/components/tickets/create-ticket-fields";
import { CreateTicketServicePicker } from "@/components/tickets/create-ticket-service-picker";
import { CreateTicketSidePanel } from "@/components/tickets/create-ticket-side-panel";
import { CreateTicketStepNav } from "@/components/tickets/create-ticket-step-nav";
import { CreateTicketStepper } from "@/components/tickets/create-ticket-stepper";
import { TicketErrorState } from "@/components/tickets/ticket-feedback-states";
import { Card } from "@/components/ui/card";
import type { CreateTicketDraft } from "@/lib/tickets/build-create-ticket-input";
import type { TicketErrorKey } from "@/lib/tickets/map-ticket-error";
import type { OriginUnitOption } from "@/lib/tickets/ticket-display";
import type { FormVersionResponse, ServiceResponse } from "@/services/service-catalog-api";
import type { TicketPriority } from "@/services/tickets-api";

interface CreateTicketDraftViewProperties {
  readonly step: number;
  readonly draft: CreateTicketDraft;
  readonly services: readonly ServiceResponse[];
  readonly originUnits: readonly OriginUnitOption[];
  readonly canChooseOriginUnit: boolean;
  readonly originUnitDisplayName: string;
  readonly selectedService: ServiceResponse | null;
  readonly activeForm: FormVersionResponse | null;
  readonly fieldErrors: ReadonlyMap<string, string>;
  readonly suggestedPriority: TicketPriority;
  readonly displayedError: TicketErrorKey | "tickets.errorCatalog" | null;
  readonly canNextService: boolean;
  readonly canSubmitDetails: boolean;
  readonly isSubmitting: boolean;
  readonly onDraftChange: (draft: CreateTicketDraft) => void;
  readonly onOriginUnitChosen: () => void;
  readonly onBack: () => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function CreateTicketDraftView({
  step,
  draft,
  services,
  originUnits,
  canChooseOriginUnit,
  originUnitDisplayName,
  selectedService,
  activeForm,
  fieldErrors,
  suggestedPriority,
  displayedError,
  canNextService,
  canSubmitDetails,
  isSubmitting,
  onDraftChange,
  onOriginUnitChosen,
  onBack,
  onSubmit,
}: CreateTicketDraftViewProperties) {
  return (
    <form className="mt-1" onSubmit={onSubmit}>
      <CreateTicketStepper activeIndex={step} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_300px]">
        <Card>
          {step === 0 ? (
            <CreateTicketServicePicker
              services={services}
              selectedId={draft.serviceId}
              onSelect={(serviceId) =>
                onDraftChange({
                  ...draft,
                  serviceId,
                  formData: serviceId === draft.serviceId ? draft.formData : {},
                  formVersionRef: serviceId === draft.serviceId ? draft.formVersionRef : null,
                })
              }
            />
          ) : (
            <CreateTicketFields
              draft={draft}
              originUnits={originUnits}
              canChooseOriginUnit={canChooseOriginUnit}
              originUnitDisplayName={originUnitDisplayName}
              selectedService={selectedService}
              activeForm={activeForm}
              fieldErrors={fieldErrors}
              suggestedPriority={suggestedPriority}
              onChange={onDraftChange}
              onOriginUnitChosen={onOriginUnitChosen}
            />
          )}
          {displayedError ? (
            <div className="px-5">
              <TicketErrorState errorKey={displayedError} />
            </div>
          ) : null}
          <CreateTicketStepNav
            step={step}
            canNextService={canNextService}
            canSubmitDetails={canSubmitDetails}
            isSubmitting={isSubmitting}
            onBack={onBack}
          />
        </Card>
        <CreateTicketSidePanel />
      </div>
    </form>
  );
}
