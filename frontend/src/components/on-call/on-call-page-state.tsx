import { CalendarClock, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { PanelSkeleton } from "@/components/ui/skeleton";
import type { OnCallQueryError } from "@/lib/on-call/use-on-call-overview-data";
import { cn } from "@/lib/utils";

export function OnCallPageHeader({
  refreshing,
  onRefresh,
}: {
  readonly refreshing: boolean;
  readonly onRefresh: () => void;
}) {
  const { t } = useTranslation();
  return (
    <PageHeader
      crumbs={[t("navigation.sections.tickets"), t("onCall.title")]}
      title={t("onCall.title")}
      subtitle={t("onCall.subtitle")}
      actions={
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
          <RefreshCw className={cn(refreshing && "animate-spin")} />
          {t("onCall.refresh")}
        </Button>
      }
    />
  );
}

export function OnCallOverviewLoading({
  error,
  pending,
  onRetry,
  header,
}: {
  readonly error: OnCallQueryError | null;
  readonly pending: boolean;
  readonly onRetry: () => void;
  readonly header: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="page-in">
      {header}
      {error === null ? (
        <PanelSkeleton label={t("onCall.loading")} />
      ) : error.disabled ? (
        <EmptyState
          icon={<CalendarClock size={18} />}
          title={t("onCall.disabledTitle")}
          body={t("onCall.disabledBody")}
        />
      ) : (
        <div className="grid gap-2">
          <ApiErrorText messageKey={error.key} requestId={error.requestId} />
          <Button variant="outline" size="sm" onClick={onRetry} disabled={pending}>
            {t("ui.retry")}
          </Button>
        </div>
      )}
    </div>
  );
}
