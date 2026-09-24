import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { controlClassName, labelClassName } from "@/components/ui/control";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { mapTicketError, type TicketErrorKey } from "@/lib/tickets/map-ticket-error";
import { splitTicket } from "@/services/tickets-split-api";
import type { TicketResponse } from "@/services/tickets-api";

function formatParentTicketLabel(ticket: TicketResponse): string | null {
  const number = ticket.parentTicketNumber?.trim() ?? "";
  if (number.length === 0) {
    return null;
  }
  const title = ticket.parentTicketTitle?.trim() ?? "";
  return title.length > 0 ? `${number} — ${title}` : number;
}

interface TicketSplitPanelProperties {
  readonly ticket: TicketResponse;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onComplete: (children: readonly TicketResponse[]) => void;
  readonly onError: (key: TicketErrorKey) => void;
}

export function TicketSplitPanel({
  ticket,
  open,
  onOpenChange,
  onComplete,
  onError,
}: TicketSplitPanelProperties) {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  const [firstTitle, setFirstTitle] = useState(`${ticket.title} (1)`);
  const [secondTitle, setSecondTitle] = useState(`${ticket.title} (2)`);
  const [busy, setBusy] = useState(false);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full max-w-md flex-col overflow-y-auto p-5">
        <SheetTitle>{t("tickets.split.title")}</SheetTitle>
        <SheetDescription className="mt-1 text-[12px] text-muted-foreground">
          {t("tickets.split.hint")}
        </SheetDescription>
        {ticket.parentTicketId ? (
          <p className="mt-3 text-[12px]">
            {t("tickets.split.parent")}:{" "}
            <Link className="tnum text-link transition-colors duration-150 hover:underline" to={`/tickets/${ticket.parentTicketId}`}>
              {formatParentTicketLabel(ticket) ?? t("tickets.split.parentFallback")}
            </Link>
          </p>
        ) : null}
        <label className={`mt-4 ${labelClassName}`}>
          {t("tickets.split.reason")}
          <input className={controlClassName} value={reason} onChange={(event) => setReason(event.target.value)} />
        </label>
        <label className={`mt-3 ${labelClassName}`}>
          {t("tickets.split.childOne")}
          <input className={controlClassName} value={firstTitle} onChange={(event) => setFirstTitle(event.target.value)} />
        </label>
        <label className={`mt-3 ${labelClassName}`}>
          {t("tickets.split.childTwo")}
          <input className={controlClassName} value={secondTitle} onChange={(event) => setSecondTitle(event.target.value)} />
        </label>
        <div className="mt-4 flex gap-2 border-t border-border/70 pt-4">
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void splitTicket(ticket.id, {
                reason,
                children: [{ title: firstTitle }, { title: secondTitle }],
              })
                .then((result) => {
                  onComplete(result.children);
                  onOpenChange(false);
                })
                .catch((error) => onError(mapTicketError(error)))
                .finally(() => setBusy(false));
            }}
          >
            {busy ? t("tickets.split.splitting") : t("tickets.split.action")}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
            {t("tickets.detail.cancelStatus")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
