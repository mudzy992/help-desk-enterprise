import { Inbox } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TicketErrorKey } from "@/lib/tickets/map-ticket-error";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PanelSkeleton } from "@/components/ui/skeleton";

interface TicketLoadingStateProperties {
  readonly label?: string;
}

export function TicketLoadingState({ label }: TicketLoadingStateProperties) {
  const { t } = useTranslation();
  return <PanelSkeleton label={label ?? t("tickets.loading")} />;
}

interface TicketEmptyStateProperties {
  readonly title: string;
  readonly body: string;
  readonly action?: ReactNode;
}

export function TicketEmptyState({ title, body, action }: TicketEmptyStateProperties) {
  return (
    <EmptyState
      icon={<Inbox size={18} strokeWidth={1.8} />}
      title={title}
      body={body}
      action={action}
    />
  );
}

interface TicketErrorStateProperties {
  readonly errorKey: TicketErrorKey | "tickets.errorCatalog";
  readonly onRetry?: () => void;
}

export function TicketErrorState({ errorKey, onRetry }: TicketErrorStateProperties) {
  const { t } = useTranslation();
  return (
    <EmptyState
      title={t(errorKey)}
      body={t("tickets.emptyHint")}
      action={
        onRetry ? (
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            {t("tickets.retry")}
          </Button>
        ) : undefined
      }
    />
  );
}
