import { useTranslation } from "react-i18next";
import type { TicketErrorKey } from "@/lib/tickets/map-ticket-error";
import { Button } from "@/components/ui/button";

interface TicketLoadingStateProperties {
  readonly label?: string;
}

export function TicketLoadingState({ label }: TicketLoadingStateProperties) {
  const { t } = useTranslation();
  return (
    <div
      className="mt-3 h-32 animate-pulse rounded-md bg-elevated"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">{label ?? t("tickets.loading")}</span>
    </div>
  );
}

interface TicketEmptyStateProperties {
  readonly message: string;
}

export function TicketEmptyState({ message }: TicketEmptyStateProperties) {
  return <p className="mt-3 text-body text-muted-foreground">{message}</p>;
}

interface TicketErrorStateProperties {
  readonly errorKey: TicketErrorKey | "tickets.errorCatalog";
  readonly onRetry?: () => void;
}

export function TicketErrorState({ errorKey, onRetry }: TicketErrorStateProperties) {
  const { t } = useTranslation();
  return (
    <div className="mt-3 grid gap-2">
      <p className="text-body text-destructive">{t(errorKey)}</p>
      {onRetry ? (
        <div>
          <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
            {t("tickets.retry")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
