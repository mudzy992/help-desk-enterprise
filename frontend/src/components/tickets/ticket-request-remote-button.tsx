import { useState } from "react";
import { Monitor } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { mapTicketError } from "@/lib/tickets/map-ticket-error";
import { ticketText } from "@/lib/tickets/ticket-text";
import { requestTicketRemote } from "@/services/tickets-remote-api";
import type { TicketResponse } from "@/services/tickets-api";

interface TicketRequestRemoteButtonProperties {
  readonly ticket: TicketResponse;
}

export function TicketRequestRemoteButton({
  ticket,
}: TicketRequestRemoteButtonProperties) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  if (ticket.status === "ARCHIVED") {
    return null;
  }
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={saving}
        onClick={() => {
          setSaving(true);
          setErrorKey(null);
          void requestTicketRemote(ticket.id)
            .then(() => setDone(true))
            .catch((error: unknown) => setErrorKey(mapTicketError(error)))
            .finally(() => setSaving(false));
        }}
      >
        <Monitor size={14} />
        {saving
          ? t("tickets.detail.requestingRemote")
          : t("tickets.detail.requestRemote")}
      </Button>
      {errorKey !== null ? (
        <span className="max-w-48 text-right text-[11px] text-danger">
          {ticketText(t, errorKey)}
        </span>
      ) : null}
      {done && errorKey === null ? (
        <span className="max-w-48 text-right text-[11px] text-muted-foreground">
          {t("tickets.detail.remoteRequested")}
        </span>
      ) : null}
    </span>
  );
}
