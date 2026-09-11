import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { controlClassName, labelClassName } from "@/components/ui/control";
import { mapTicketError, type TicketErrorKey } from "@/lib/tickets/map-ticket-error";
import { splitTicket } from "@/services/tickets-split-api";
import type { TicketResponse } from "@/services/tickets-api";

interface TicketSplitPanelProperties {
  readonly ticket: TicketResponse;
  readonly visible: boolean;
  readonly onComplete: (children: readonly TicketResponse[]) => void;
  readonly onError: (key: TicketErrorKey) => void;
}

export function TicketSplitPanel({
  ticket,
  visible,
  onComplete,
  onError,
}: TicketSplitPanelProperties) {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  const [firstTitle, setFirstTitle] = useState(`${ticket.title} (1)`);
  const [secondTitle, setSecondTitle] = useState(`${ticket.title} (2)`);
  const [busy, setBusy] = useState(false);
  if (!visible) {
    return null;
  }
  return (
    <section className="rounded-lg border border-border bg-surface px-4 py-3.5">
      <h3 className="text-[13.5px] font-semibold">{t("tickets.split.title")}</h3>
      <p className="mt-1 text-[12px] text-muted-foreground">{t("tickets.split.hint")}</p>
      {ticket.parentTicketId ? (
        <p className="mt-2 text-[12px]">
          {t("tickets.split.parent")}:{" "}
          <Link className="tnum text-[#7FA8F5] hover:underline" to={`/tickets/${ticket.parentTicketId}`}>
            {ticket.parentTicketId}
          </Link>
        </p>
      ) : null}
      <label className={`mt-3 ${labelClassName}`}>
        {t("tickets.split.reason")}
        <input className={controlClassName} value={reason} onChange={(event) => setReason(event.target.value)} />
      </label>
      <label className={`mt-2 ${labelClassName}`}>
        {t("tickets.split.childOne")}
        <input className={controlClassName} value={firstTitle} onChange={(event) => setFirstTitle(event.target.value)} />
      </label>
      <label className={`mt-2 ${labelClassName}`}>
        {t("tickets.split.childTwo")}
        <input className={controlClassName} value={secondTitle} onChange={(event) => setSecondTitle(event.target.value)} />
      </label>
      <Button
        type="button"
        size="sm"
        className="mt-3"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void splitTicket(ticket.id, {
            reason,
            children: [{ title: firstTitle }, { title: secondTitle }],
          })
            .then((result) => onComplete(result.children))
            .catch((error) => onError(mapTicketError(error)))
            .finally(() => setBusy(false));
        }}
      >
        {busy ? t("tickets.split.splitting") : t("tickets.split.action")}
      </Button>
    </section>
  );
}
