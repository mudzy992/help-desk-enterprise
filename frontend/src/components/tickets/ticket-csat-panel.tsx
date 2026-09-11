import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { labelClassName, textareaClassName } from "@/components/ui/control";
import { mapTicketError, type TicketErrorKey } from "@/lib/tickets/map-ticket-error";
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
    <Card className="grid gap-2 px-4 py-3.5">
      <h3 className="text-[13.5px] font-semibold text-foreground">{t("tickets.csat.title")}</h3>
      <p className="text-[12.5px] text-muted-foreground">
        {csat.submitted ? t("tickets.csat.submitted") : t("tickets.csat.hint")}
      </p>
      <div className="flex flex-wrap gap-1">
        {scale.map((value) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={value === rating ? "default" : "outline"}
            disabled={!canSubmit}
            onClick={() => {
              if (canSubmit) {
                setRating(value);
              }
            }}
          >
            {value}
          </Button>
        ))}
      </div>
      {csat.submitted && csat.comment ? (
        <p className="text-[12.5px] text-foreground">{csat.comment}</p>
      ) : null}
      {canSubmit ? (
        <>
          <label className={labelClassName}>
            {t("tickets.csat.comment")}
            <textarea
              className={textareaClassName}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              rows={3}
            />
          </label>
          <Button type="button" size="sm" disabled={rating < 1 || isSaving} onClick={() => void submit()}>
            {isSaving ? t("tickets.csat.submitting") : t("tickets.csat.submit")}
          </Button>
        </>
      ) : null}
    </Card>
  );
}
