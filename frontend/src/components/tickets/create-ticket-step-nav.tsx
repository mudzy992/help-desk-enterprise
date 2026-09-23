import { ArrowLeft, ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CREATE_TICKET_STEP_TOTAL } from "@/components/tickets/create-ticket-stepper";
import { Button } from "@/components/ui/button";
import { ticketText } from "@/lib/tickets/ticket-text";

interface CreateTicketStepNavProperties {
  readonly step: number;
  readonly canNextService: boolean;
  readonly canSubmitDetails: boolean;
  readonly isSubmitting: boolean;
  readonly onBack: () => void;
}

export function CreateTicketStepNav({
  step,
  canNextService,
  canSubmitDetails,
  isSubmitting,
  onBack,
}: CreateTicketStepNavProperties) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between border-t border-border/70 px-5 py-3.5">
      <Button type="button" variant="ghost" size="sm" disabled={step === 0} onClick={onBack}>
        <ArrowLeft size={14} /> {t("tickets.stepBack")}
      </Button>
      <div className="flex items-center gap-2">
        <span className="tnum text-[11px] text-muted-foreground/70">
          {ticketText(t, "tickets.stepCount", { current: step + 1, total: CREATE_TICKET_STEP_TOTAL })}
        </span>
        {step === 0 ? (
          <Button type="submit" variant="primary" size="sm" disabled={!canNextService}>
            {t("tickets.stepNext")} <ArrowRight size={14} />
          </Button>
        ) : (
          <Button type="submit" variant="primary" size="sm" disabled={isSubmitting || !canSubmitDetails}>
            {isSubmitting ? t("tickets.checkingKb") : t("tickets.checkKb")}
          </Button>
        )}
      </div>
    </div>
  );
}
