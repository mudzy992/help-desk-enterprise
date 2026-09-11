import { Star } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { textareaClassName } from "@/components/ui/control";
import { mapTicketError, type TicketErrorKey } from "@/lib/tickets/map-ticket-error";
import { cn } from "@/lib/utils";
import { submitTicketCsat } from "@/services/tickets-csat-api";
import type { TicketResponse } from "@/services/tickets-api";

interface TicketCsatPanelProperties {
  readonly ticket: TicketResponse;
  readonly onComplete: (ticket: TicketResponse) => void;
  readonly onError: (key: TicketErrorKey) => void;
}

export function TicketCsatPanel({ ticket, onComplete, onError }: TicketCsatPanelProperties) {
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
    <Card>
      <CardHeader title={t("tickets.csat.title")} subtitle={t("tickets.csat.hint")} />
      <div className="flex items-center gap-1.5 px-4 py-4">
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
            className="rounded-md p-0.5 text-border transition-colors duration-150 hover:text-warning disabled:opacity-70"
            aria-label={String(value)}
          >
            <Star
              size={17}
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
        <p className="px-4 pb-4 text-[12.5px] text-foreground">{csat.comment}</p>
      ) : null}
      {canSubmit ? (
        <div className="grid gap-2 border-t border-border/70 px-4 py-3">
          <textarea
            className={textareaClassName}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            rows={3}
            placeholder={t("tickets.csat.comment")}
          />
          <Button type="button" size="sm" disabled={rating < 1 || isSaving} onClick={() => void submit()}>
            {isSaving ? t("tickets.csat.submitting") : t("tickets.csat.submit")}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
