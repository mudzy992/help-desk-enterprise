import { KnowledgeInterceptPanel } from "@/components/tickets/knowledge-intercept-panel";
import { TicketErrorState } from "@/components/tickets/ticket-feedback-states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { WizardStepper } from "@/components/ui/wizard-stepper";
import type { TicketErrorKey } from "@/lib/tickets/map-ticket-error";
import type { KnowledgeInterceptSuggestion } from "@/services/knowledge-base-api";
import { useTranslation } from "react-i18next";

interface CreateTicketInterceptViewProperties {
  readonly displayedError: TicketErrorKey | "tickets.errorCatalog" | null;
  readonly isSubmitting: boolean;
  readonly items: readonly KnowledgeInterceptSuggestion[];
  readonly helped: boolean;
  readonly onHelped: () => void;
  readonly onContinue: () => void;
  readonly onBack: () => void;
  readonly onCreateAnyway: () => void;
}

export function CreateTicketInterceptView({
  displayedError,
  isSubmitting,
  items,
  helped,
  onHelped,
  onContinue,
  onBack,
  onCreateAnyway,
}: CreateTicketInterceptViewProperties) {
  const { t } = useTranslation();
  return (
    <div className="mt-1">
      <WizardStepper
        steps={[
          { key: "compose", label: t("tickets.createStepDetails") },
          { key: "intercept", label: t("tickets.createStepKnowledge") },
        ]}
        activeIndex={1}
      />
      {displayedError ? <TicketErrorState errorKey={displayedError} /> : null}
      {displayedError === "tickets.errorDuplicateTicket" ? (
        <Button
          type="button"
          variant="outline"
          className="mb-3"
          disabled={isSubmitting}
          onClick={onCreateAnyway}
        >
          {isSubmitting ? t("tickets.creating") : t("tickets.createAnyway")}
        </Button>
      ) : null}
      <Card className="px-4 py-4">
        <KnowledgeInterceptPanel
          items={items}
          helped={helped}
          onHelped={onHelped}
          onContinue={onContinue}
          onBack={onBack}
          isSubmitting={isSubmitting}
        />
      </Card>
    </div>
  );
}
