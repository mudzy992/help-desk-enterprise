import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CreateTicketSidePanel } from "@/components/tickets/create-ticket-side-panel";
import { CreateTicketStepper, CREATE_TICKET_STEP_TOTAL } from "@/components/tickets/create-ticket-stepper";
import { KnowledgeInterceptPanel } from "@/components/tickets/knowledge-intercept-panel";
import { TicketErrorState } from "@/components/tickets/ticket-feedback-states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ticketText } from "@/lib/tickets/ticket-text";
import type { TicketErrorKey } from "@/lib/tickets/map-ticket-error";
import type { KnowledgeInterceptSuggestion } from "@/services/knowledge-base-api";

interface CreateTicketInterceptViewProperties {
  readonly displayedError: TicketErrorKey | "tickets.errorCatalog" | null;
  readonly isSubmitting: boolean;
  readonly items: readonly KnowledgeInterceptSuggestion[];
  readonly helped: boolean;
  readonly onHelped: () => void;
  readonly onContinue: () => void;
  readonly onBack: () => void;
}

export function CreateTicketInterceptView({
  displayedError,
  isSubmitting,
  items,
  helped,
  onHelped,
  onContinue,
  onBack,
}: CreateTicketInterceptViewProperties) {
  const { t } = useTranslation();
  return (
    <div className="mt-1">
      <CreateTicketStepper activeIndex={2} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_300px]">
        <Card>
          <div className="p-5">
            {displayedError ? <TicketErrorState errorKey={displayedError} /> : null}
            <KnowledgeInterceptPanel
              items={items}
              helped={helped}
              onHelped={onHelped}
              onContinue={onContinue}
              isSubmitting={isSubmitting}
            />
          </div>
          <div className="flex items-center justify-between border-t border-border/70 px-5 py-3.5">
            <Button type="button" variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft size={14} /> {t("tickets.stepBack")}
            </Button>
            <span className="text-[11px] text-muted-foreground/70 tnum">
              {ticketText(t, "tickets.stepCount", { current: 3, total: CREATE_TICKET_STEP_TOTAL })}
            </span>
          </div>
        </Card>
        <CreateTicketSidePanel />
      </div>
    </div>
  );
}
