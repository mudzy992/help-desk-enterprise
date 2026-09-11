import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { labelClassName, textareaClassName, hintClassName, errorTextClassName } from "@/components/ui/control";
import { mapTicketError, type TicketErrorKey } from "@/lib/tickets/map-ticket-error";
import { requestTicketBreakGlass } from "@/services/tickets-confidential-api";

interface TicketBreakGlassPanelProperties {
  readonly ticketId: string;
  readonly onGranted: () => void;
}

export function TicketBreakGlassPanel({
  ticketId,
  onGranted,
}: TicketBreakGlassPanelProperties) {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [errorKey, setErrorKey] = useState<TicketErrorKey | null>(null);

  return (
    <section className="max-w-xl rounded-lg border border-warning/35 bg-warning/10 px-4 py-4">
      <div className="flex items-start gap-2">
        <ShieldAlert size={16} strokeWidth={1.9} className="mt-0.5 text-warning" />
        <div>
          <h2 className="text-[13.5px] font-semibold text-foreground">
            {t("tickets.confidential.breakGlassTitle")}
          </h2>
          <p className={`mt-1 ${hintClassName}`}>
            {t("tickets.confidential.breakGlassHint")}
          </p>
        </div>
      </div>
      <label className={`mt-4 ${labelClassName}`}>
        {t("tickets.confidential.reason")}
        <textarea
          className={textareaClassName}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          required
        />
      </label>
      {errorKey ? <p className={`mt-2 ${errorTextClassName}`}>{t(errorKey)}</p> : null}
      <Button
        type="button"
        className="mt-3"
        size="sm"
        disabled={isSaving || reason.trim().length === 0}
        onClick={() => {
          setIsSaving(true);
          setErrorKey(null);
          void requestTicketBreakGlass(ticketId, reason.trim())
            .then(() => onGranted())
            .catch((error: unknown) => setErrorKey(mapTicketError(error)))
            .finally(() => setIsSaving(false));
        }}
      >
        {isSaving ? t("tickets.confidential.requesting") : t("tickets.confidential.request")}
      </Button>
    </section>
  );
}
