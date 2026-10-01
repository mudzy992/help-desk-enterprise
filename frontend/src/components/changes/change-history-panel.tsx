import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardHeader } from "@/components/ui/card";
import { errorTextClassName } from "@/components/ui/control";
import { EmptyState } from "@/components/ui/empty-state";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { formatAssetDateTime } from "@/lib/assets/asset-view";
import { changeHistoryText, mapChangeError } from "@/lib/changes/change-view";
import { mapApiError } from "@/lib/map-api-error";
import { changeQueryKeys, getChangeEvents } from "@/services/changes-api";

/** Paket 3.4 (§19): newest first, the last 200 entries. */
export function ChangeHistoryPanel({ changeId, versionKey }: { readonly changeId: string; readonly versionKey: number }) {
  const { t, i18n } = useTranslation();
  const query = useQuery({
    queryKey: [...changeQueryKeys.events(changeId), versionKey],
    queryFn: () => getChangeEvents(changeId),
    retry: false,
  });
  if (query.isLoading) return <PanelSkeleton label={t("ui.loading")} />;
  if (query.error || query.data === undefined) {
    return (
      <p role="alert" className={errorTextClassName}>
        {t(mapChangeError(query.error) ?? mapApiError(query.error))}
      </p>
    );
  }
  if (query.data.items.length === 0) {
    return <EmptyState icon={<History size={18} />} title={t("changes.history.emptyTitle")} body={t("changes.history.emptyBody")} />;
  }
  const translate = (key: string, options?: Record<string, unknown>) => t(key as never, options as never) as unknown as string;
  return (
    <Card className="p-0">
      <CardHeader title={t("changes.history.title")} />
      <ol className="divide-y divide-border/60">
        {query.data.items.map((event) => (
          <li key={event.id} className="grid gap-0.5 px-4 py-2 text-[12.5px]">
            <span className="text-foreground">{changeHistoryText(translate, event.action, event.detail)}</span>
            <span className="text-[11.5px] text-muted-foreground">
              {event.actor?.displayName ?? t("changes.history.system")} · {formatAssetDateTime(event.createdAt, i18n.language)}
            </span>
            {typeof event.detail?.reason === "string" && event.detail.reason.length > 0 ? (
              <span className="text-[11.5px] text-muted-foreground">{t("changes.history.reason", { reason: event.detail.reason })}</span>
            ) : null}
            {typeof event.detail?.comment === "string" && event.detail.comment.length > 0 ? (
              <span className="text-[11.5px] text-muted-foreground">{t("changes.history.comment", { comment: event.detail.comment })}</span>
            ) : null}
          </li>
        ))}
      </ol>
    </Card>
  );
}
