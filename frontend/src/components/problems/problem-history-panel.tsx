import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardHeader } from "@/components/ui/card";
import { errorTextClassName } from "@/components/ui/control";
import { EmptyState } from "@/components/ui/empty-state";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { formatAssetDateTime } from "@/lib/assets/asset-view";
import { mapApiError } from "@/lib/map-api-error";
import { mapProblemError, problemHistoryText } from "@/lib/problems/problem-view";
import { getProblemEvents, problemDetailKeys } from "@/services/problems-api";

/** Paket 3.3 (§16): newest first, the last 200 entries. */
export function ProblemHistoryPanel({ problemId, versionKey }: { readonly problemId: string; readonly versionKey: number }) {
  const { t, i18n } = useTranslation();
  const query = useQuery({
    queryKey: [...problemDetailKeys.events(problemId), versionKey],
    queryFn: () => getProblemEvents(problemId),
    retry: false,
  });
  if (query.isLoading) return <PanelSkeleton label={t("ui.loading")} />;
  if (query.error || query.data === undefined) {
    return (
      <p role="alert" className={errorTextClassName}>
        {t(mapProblemError(query.error) ?? mapApiError(query.error))}
      </p>
    );
  }
  if (query.data.items.length === 0) {
    return <EmptyState icon={<History size={18} />} title={t("problems.history.emptyTitle")} body={t("problems.history.emptyBody")} />;
  }
  const translate = (key: string, options?: Record<string, unknown>) => t(key as never, options as never) as unknown as string;
  return (
    <Card className="p-0">
      <CardHeader title={t("problems.history.title")} />
      <ol className="divide-y divide-border/60">
        {query.data.items.map((event) => (
          <li key={event.id} className="grid gap-0.5 px-4 py-2 text-[12.5px]">
            <span className="text-foreground">{problemHistoryText(translate, event.action, event.detail)}</span>
            <span className="text-[11.5px] text-muted-foreground">
              {event.actor?.displayName ?? t("problems.history.system")} · {formatAssetDateTime(event.createdAt, i18n.language)}
            </span>
            {typeof event.detail?.reason === "string" && event.detail.reason.length > 0 ? (
              <span className="text-[11.5px] text-muted-foreground">{t("problems.history.reason", { reason: event.detail.reason })}</span>
            ) : null}
          </li>
        ))}
      </ol>
    </Card>
  );
}
