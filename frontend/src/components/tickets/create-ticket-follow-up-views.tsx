import { CreateTicketInterceptView } from "@/components/tickets/create-ticket-intercept-view";
import { CreateTicketReviewView } from "@/components/tickets/create-ticket-review-view";
import type { CreateTicketDraft } from "@/lib/tickets/build-create-ticket-input";
import type { TicketErrorKey } from "@/lib/tickets/map-ticket-error";
import type { FormVersionResponse, ServiceResponse } from "@/services/service-catalog-api";
import type { KnowledgeInterceptSuggestion } from "@/services/knowledge-base-api";
import type { PriorityMatrixCell } from "@/services/priority-matrix-api";

interface CreateTicketFollowUpViewsProperties {
  readonly step: number;
  readonly draft: CreateTicketDraft;
  readonly selectedService: ServiceResponse | null;
  readonly activeForm: FormVersionResponse | null;
  readonly matrixCells: readonly PriorityMatrixCell[] | null;
  readonly displayedError: TicketErrorKey | "tickets.errorCatalog" | null;
  readonly isSubmitting: boolean;
  readonly suggestions: readonly KnowledgeInterceptSuggestion[];
  readonly helped: boolean;
  readonly onHelped: () => void;
  readonly onContinue: () => void;
  readonly onBackToDetails: () => void;
  readonly onBackToIntercept: () => void;
  readonly onSubmit: () => void;
  readonly onCreateAnyway: () => void;
}

export function CreateTicketFollowUpViews({
  step,
  draft,
  selectedService,
  activeForm,
  matrixCells,
  displayedError,
  isSubmitting,
  suggestions,
  helped,
  onHelped,
  onContinue,
  onBackToDetails,
  onBackToIntercept,
  onSubmit,
  onCreateAnyway,
}: CreateTicketFollowUpViewsProperties) {
  if (step === 2) {
    return (
      <CreateTicketInterceptView
        displayedError={displayedError}
        isSubmitting={isSubmitting}
        items={suggestions}
        helped={helped}
        onHelped={onHelped}
        onContinue={onContinue}
        onBack={onBackToDetails}
      />
    );
  }
  if (step === 3) {
    return (
      <CreateTicketReviewView
        draft={draft}
        selectedService={selectedService}
        activeForm={activeForm}
        matrixCells={matrixCells}
        displayedError={displayedError}
        isSubmitting={isSubmitting}
        onBack={onBackToIntercept}
        onSubmit={onSubmit}
        onCreateAnyway={onCreateAnyway}
      />
    );
  }
  return null;
}
