import { useState } from "react";
import { GitMerge } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { errorTextClassName, labelClassName, textareaClassName } from "@/components/ui/control";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { mapTicketError, type TicketErrorKey } from "@/lib/tickets/map-ticket-error";
import { ticketText } from "@/lib/tickets/ticket-text";
import { cn } from "@/lib/utils";
import type { TicketResponse } from "@/services/tickets-api";
import { unmergeTicket } from "@/services/tickets-merge-api";

interface TicketMergedBannerProperties {
  readonly ticket: TicketResponse;
  readonly canUnmerge: boolean;
  readonly onUnmerged: (updated: TicketResponse) => void;
}

/**
 * Package 1.2 (M7): on a merged child — where the work continues, and for
 * staff with `ticket.merge` the way back (unmerge with a reason).
 */
export function TicketMergedBanner({ ticket, canUnmerge, onUnmerged }: TicketMergedBannerProperties) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<TicketErrorKey | null>(null);
  const parentId = ticket.mergedIntoTicketId ?? null;
  if (parentId === null) {
    return null;
  }
  const parentNumber = ticket.mergedIntoTicketNumber ?? t("tickets.merge.parentFallback");
  const trimmed = reason.trim();
  return (
    <div
      className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/6 px-3 py-2 text-[12.5px]"
      role="status"
      data-testid="ticket-merged-banner"
    >
      <GitMerge size={14} className="text-link" aria-hidden="true" />
      <span>
        {t("tickets.merge.bannerPrefix")}{" "}
        <Link className="tnum font-medium text-link hover:underline" to={`/tickets/${parentId}`}>
          {parentNumber}
        </Link>
        . {t("tickets.merge.bannerHint")}
      </span>
      {canUnmerge ? (
        <Button type="button" size="sm" variant="outline" className="ml-auto" onClick={() => setOpen(true)} data-testid="ticket-unmerge">
          {t("tickets.merge.unmerge")}
        </Button>
      ) : null}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full max-w-md flex-col overflow-y-auto p-5">
          <SheetTitle>{t("tickets.merge.unmergeTitle")}</SheetTitle>
          <SheetDescription className="mt-1 text-[12px] text-muted-foreground">
            {t("tickets.merge.unmergeHint")}
          </SheetDescription>
          <label className={`mt-4 ${labelClassName}`}>
            {t("tickets.merge.reason")}
            <textarea
              className={cn(textareaClassName, "min-h-16")}
              value={reason}
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
              data-testid="ticket-unmerge-reason"
            />
          </label>
          {errorKey ? (
            <p className={`mt-2 ${errorTextClassName}`} role="alert">
              {ticketText(t, errorKey)}
            </p>
          ) : null}
          <div className="mt-4 flex gap-2 border-t border-border/70 pt-4">
            <Button
              type="button"
              size="sm"
              disabled={busy || trimmed.length < 3}
              data-testid="ticket-unmerge-confirm"
              onClick={() => {
                setBusy(true);
                setErrorKey(null);
                void unmergeTicket(ticket.id, { reason: trimmed })
                  .then((updated) => {
                    setOpen(false);
                    setReason("");
                    onUnmerged(updated);
                  })
                  .catch((error) => setErrorKey(mapTicketError(error)))
                  .finally(() => setBusy(false));
              }}
            >
              {busy ? t("tickets.detail.saving") : t("tickets.merge.unmerge")}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
              {t("tickets.detail.cancelStatus")}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
