import { Star } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { textareaClassName } from "@/components/ui/control";
import { mapTicketError, type TicketErrorKey } from "@/lib/tickets/map-ticket-error";
import { cn } from "@/lib/utils";
import { submitTicketCsat } from "@/services/tickets-csat-api";
import type { TicketResponse } from "@/services/tickets-api";

interface TicketCsatPanelProperties {
  readonly ticket: TicketResponse;
  readonly onComplete: (ticket: TicketResponse) => void;
  readonly onError: (key: TicketErrorKey) => void;
  readonly className?: string;
}

/**
 * Paket 4.2: the CSAT form moved out of the rail into a bar across the ticket,
 * so it is visible the moment the ticket is resolved. The card has no header —
 * the caller supplies the context.
 */
export function TicketCsatPanel({ ticket, onComplete, onError, className }: TicketCsatPanelProperties) {
  const { t } = useTranslation();
  const csat = ticket.csat;
  const [rating, setRating] = useState(csat?.rating ?? 0);
  const [comment, setComment] = useState(csat?.comment ?? "");
  const [isSaving, setIsSaving] = useState(false);
  if (csat === undefined || (!csat.submitted && !csat.canSubmit)) {
    return null;
  }
  const scale = Array.from({ length: csat.scaleMax }, (_, index) => index + 1);
  const canSubmit = csat.canSubmit && !isSaving;

  const submit = async () => {
    if (!canSubmit || rating < 1) {
      return;
    }
    setIsSaving(true);
    try {
      onComplete(
        await submitTicketCsat(ticket.id, {
          rating,
          comment: comment.trim().length === 0 ? undefined : comment.trim(),
        }),
      );
    } catch (error) {
      onError(mapTicketError(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className={className} data-testid="ticket-csat-panel">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 pb-2 pt-3">
        <span className="text-[12.5px] font-semibold text-foreground">{t("tickets.csat.title")}</span>
        <span className="text-[11.5px] text-muted-foreground">{t("tickets.csat.hint")}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 px-4 pb-4">
        {scale.map((value) => (
          <button
            key={value}
            type="button"
            disabled={!canSubmit}
            onClick={() => {
              if (canSubmit) {
                setRating(value);
              }
            }}
            className="rounded-full p-1 text-border transition-all duration-150 hover:scale-105 hover:text-warning focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/70 disabled:opacity-70 disabled:hover:scale-100"
            aria-label={String(value)}
          >
            <Star
              size={18}
              aria-hidden="true"
              className={cn(value <= rating ? "fill-warning text-warning" : "text-border")}
            />
          </button>
        ))}
        {rating > 0 ? (
          <span className="ml-1.5 tnum text-[13px] font-medium text-foreground">{rating}.0</span>
        ) : null}
        {ticket.closePolicy?.closeCode ? (
          <span className="ml-auto text-[11px] text-muted-foreground">
            {ticket.closePolicy.closeCode.name}
          </span>
        ) : null}
      </div>
      {csat.submitted && csat.comment ? (
        <p className="max-w-[720px] px-4 pb-4 text-[12.5px] text-foreground">{csat.comment}</p>
      ) : null}
      {canSubmit ? (
        <div className="flex flex-col gap-2 border-t border-border/70 px-4 py-3 sm:flex-row sm:items-end">
          <textarea
            className={cn(textareaClassName, "sm:max-w-[520px]")}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            rows={3}
            placeholder={t("tickets.csat.comment")}
          />
          <Button
            type="button"
            size="sm"
            className="shrink-0 self-start sm:self-auto"
            disabled={rating < 1 || isSaving}
            onClick={() => void submit()}
          >
            {isSaving ? t("tickets.csat.submitting") : t("tickets.csat.submit")}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
