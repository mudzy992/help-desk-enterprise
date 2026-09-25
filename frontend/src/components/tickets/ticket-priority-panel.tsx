import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { errorTextClassName, labelClassName, textareaClassName } from "@/components/ui/control";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { TicketPriorityBadge } from "@/components/tickets/ticket-badges";
import { mapTicketError, type TicketErrorKey } from "@/lib/tickets/map-ticket-error";
import { ticketPriorityLabelKey, ticketPriorityValues } from "@/lib/tickets/ticket-constants";
import { ticketText } from "@/lib/tickets/ticket-text";
import { cn } from "@/lib/utils";
import type { TicketPriority, TicketResponse } from "@/services/tickets-api";
import { overrideTicketPriority } from "@/services/tickets-merge-api";

const minimumReasonLength = 3;
const maximumReasonLength = 500;

interface TicketPriorityPanelProperties {
  readonly ticket: TicketResponse;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onComplete: (updated: TicketResponse) => void;
}

/**
 * Package 1.2 (P6): manual priority with a required reason; the SLA targets
 * are re-measured from the ticket start. A manual priority can be handed back
 * to the impact × urgency matrix.
 */
export function TicketPriorityPanel({ ticket, open, onOpenChange, onComplete }: TicketPriorityPanelProperties) {
  const { t } = useTranslation();
  const [priority, setPriority] = useState<TicketPriority>(ticket.priority);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<TicketErrorKey | null>(null);
  useEffect(() => {
    if (open) {
      setPriority(ticket.priority);
      setReason("");
      setErrorKey(null);
    }
  }, [open, ticket.priority]);
  const trimmed = reason.trim();
  const reasonValid = trimmed.length >= minimumReasonLength && trimmed.length <= maximumReasonLength;

  const submit = (resetToMatrix: boolean) => {
    setBusy(true);
    setErrorKey(null);
    void overrideTicketPriority(
      ticket.id,
      resetToMatrix ? { resetToMatrix: true, reason: trimmed } : { priority, reason: trimmed },
    )
      .then((updated) => {
        onComplete(updated);
        onOpenChange(false);
      })
      .catch((error) => setErrorKey(mapTicketError(error)))
      .finally(() => setBusy(false));
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full max-w-md flex-col overflow-y-auto p-5" data-testid="ticket-priority-panel">
        <SheetTitle>{t("tickets.priority.title")}</SheetTitle>
        <SheetDescription className="mt-1 text-[12px] text-muted-foreground">
          {t("tickets.priority.hint")}
        </SheetDescription>
        <div className="mt-4">
          <span className={labelClassName}>{t("tickets.priority.current")}</span>
          <div className="mt-1 flex items-center gap-2">
            <TicketPriorityBadge priority={ticket.priority} />
            {ticket.priorityOverridden ? (
              <span className="text-[11px] text-muted-foreground">{t("tickets.priority.manualBadge")}</span>
            ) : null}
          </div>
        </div>
        <fieldset className="mt-4">
          <legend className={labelClassName}>{t("tickets.priority.new")}</legend>
          <div className="mt-1 grid grid-cols-2 gap-2" role="radiogroup">
            {ticketPriorityValues.map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={priority === value}
                data-testid={`ticket-priority-option-${value}`}
                onClick={() => setPriority(value)}
                className={cn(
                  "rounded-md border px-3 py-2 text-left text-[12.5px] transition-colors duration-150",
                  priority === value
                    ? "border-primary bg-primary/8 text-foreground"
                    : "border-border hover:bg-muted/60",
                )}
              >
                {ticketText(t, ticketPriorityLabelKey[value])}
              </button>
            ))}
          </div>
        </fieldset>
        <label className={`mt-4 ${labelClassName}`}>
          {t("tickets.priority.reason")}
          <textarea
            className={cn(textareaClassName, "min-h-20")}
            value={reason}
            maxLength={maximumReasonLength}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t("tickets.priority.reasonPlaceholder")}
            data-testid="ticket-priority-reason"
          />
        </label>
        <p className="mt-2 text-[11.5px] text-muted-foreground">{t("tickets.priority.slaNotice")}</p>
        {errorKey ? (
          <p className={`mt-2 ${errorTextClassName}`} role="alert">
            {ticketText(t, errorKey)}
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2 border-t border-border/70 pt-4">
          <Button
            type="button"
            size="sm"
            disabled={busy || !reasonValid || priority === ticket.priority}
            onClick={() => submit(false)}
            data-testid="ticket-priority-save"
          >
            {busy ? t("tickets.detail.saving") : t("tickets.priority.save")}
          </Button>
          {ticket.priorityOverridden ? (
            <Button type="button" size="sm" variant="outline" disabled={busy || !reasonValid} onClick={() => submit(true)}>
              {t("tickets.priority.resetToMatrix")}
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
            {t("tickets.detail.cancelStatus")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
