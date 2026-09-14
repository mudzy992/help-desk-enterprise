import { ArrowLeft, GitBranch, Send } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CreateTicketSidePanel } from "@/components/tickets/create-ticket-side-panel";
import { CreateTicketStepper, CREATE_TICKET_STEP_TOTAL } from "@/components/tickets/create-ticket-stepper";
import { TicketPriorityBadge } from "@/components/tickets/ticket-badges";
import { TicketErrorState } from "@/components/tickets/ticket-feedback-states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { calculateTicketPriority } from "@/lib/tickets/calculate-ticket-priority";
import type { CreateTicketDraft } from "@/lib/tickets/build-create-ticket-input";
import type { TicketErrorKey } from "@/lib/tickets/map-ticket-error";
import { ticketSeverityLabelKey } from "@/lib/tickets/ticket-constants";
import { ticketText } from "@/lib/tickets/ticket-text";
import type { FormVersionResponse, ServiceResponse } from "@/services/service-catalog-api";

interface CreateTicketReviewViewProperties {
  readonly draft: CreateTicketDraft;
  readonly selectedService: ServiceResponse | null;
  readonly activeForm: FormVersionResponse | null;
  readonly displayedError: TicketErrorKey | "tickets.errorCatalog" | null;
  readonly isSubmitting: boolean;
  readonly onBack: () => void;
  readonly onSubmit: () => void;
  readonly onCreateAnyway: () => void;
}

export function CreateTicketReviewView({
  draft,
  selectedService,
  activeForm,
  displayedError,
  isSubmitting,
  onBack,
  onSubmit,
  onCreateAnyway,
}: CreateTicketReviewViewProperties) {
  const { t } = useTranslation();
  const priority = calculateTicketPriority(draft.impact, draft.urgency);
  const formVersionLabel = activeForm?.formVersionRef ?? draft.formVersionRef ?? "—";
  return (
    <div className="mt-1">
      <CreateTicketStepper activeIndex={3} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_300px]">
        <Card>
          <div className="p-5">
            <h2 className="text-[14px] font-semibold text-foreground">{t("tickets.createReviewTitle")}</h2>
            <p className="mt-0.5 text-[12px] text-muted-foreground">{t("tickets.createReviewHint")}</p>
            {displayedError ? <TicketErrorState errorKey={displayedError} /> : null}
            {displayedError === "tickets.errorDuplicateTicket" ? (
              <Button
                type="button"
                variant="outline"
                className="mt-3"
                disabled={isSubmitting}
                onClick={onCreateAnyway}
              >
                {isSubmitting ? t("tickets.creating") : t("tickets.createAnyway")}
              </Button>
            ) : null}
            <div className="mt-4 space-y-2.5 text-[12.5px]">
              <div className="rounded-md border border-border bg-background/40 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground/70">
                  {t("tickets.createReviewTitleLabel")}
                </p>
                <p className="mt-0.5 text-[13px] font-medium text-foreground">{draft.title || "—"}</p>
                <p className="mt-1 text-[11.5px] text-muted-foreground">
                  {selectedService?.name ?? "—"}
                  {" · "}
                  {t("tickets.detail.formVersion")} {formVersionLabel}
                </p>
              </div>
              <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                <div className="rounded-md border border-border bg-background/40 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground/70">
                    {t("tickets.calculatedPriority")}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-2">
                    <TicketPriorityBadge priority={priority} />
                    <span className="text-[11px] text-muted-foreground">
                      {ticketText(t, ticketSeverityLabelKey[draft.impact])}
                      {" × "}
                      {ticketText(t, ticketSeverityLabelKey[draft.urgency])}
                    </span>
                  </p>
                </div>
                <div className="rounded-md border border-border bg-background/40 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground/70">
                    {t("tickets.createReviewApprovals")}
                  </p>
                  <p className="mt-1 text-[12.5px] text-foreground/90">
                    {selectedService?.requiresApproval
                      ? ticketText(t, "tickets.approvalsNeeded", { count: 1 })
                      : t("tickets.createReviewApprovalsNone")}
                  </p>
                </div>
              </div>
              <div className="rounded-md border border-border bg-background/40 px-4 py-3">
                <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.08em] text-muted-foreground/70">
                  <GitBranch size={11} /> {t("tickets.createReviewRoutingTitle")}
                </p>
                <p className="mt-1.5 text-[12.5px] text-muted-foreground">
                  {t("tickets.createReviewRoutingPending")}
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-border/70 px-5 py-3.5">
            <Button type="button" variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft size={14} /> {t("tickets.stepBack")}
            </Button>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground/70 tnum">
                {ticketText(t, "tickets.stepCount", { current: 4, total: CREATE_TICKET_STEP_TOTAL })}
              </span>
              <Button type="button" variant="primary" size="sm" disabled={isSubmitting} onClick={onSubmit}>
                <Send size={13} /> {isSubmitting ? t("tickets.creating") : t("tickets.sendTicket")}
              </Button>
            </div>
          </div>
        </Card>
        <CreateTicketSidePanel />
      </div>
    </div>
  );
}
