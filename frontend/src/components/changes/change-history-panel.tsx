import { useInfiniteQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TranslationKey } from "@/i18n/translation-key";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { errorTextClassName } from "@/components/ui/control";
import { EmptyState } from "@/components/ui/empty-state";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { formatAssetDateTime } from "@/lib/assets/asset-view";
import { changeHistoryText, mapChangeError } from "@/lib/changes/change-view";
import { mapApiError } from "@/lib/map-api-error";
import { changeQueryKeys, getChangeEvents } from "@/services/changes-api";

/**
 * Delivery invariant (requirement): newest first.
 *
 * W7.76 (`BA-changes-18`): the timeline used to end at 200 events with nothing
 * saying so. It is a cursor page now: the panel offers "older" while the server
 * reports more, and an exhausted list simply has no button.
 */
export function ChangeHistoryPanel({
  changeId,
  versionKey,
}: {
  readonly changeId: string;
  readonly versionKey: number;
}) {
  const { t, i18n } = useTranslation();
  const query = useInfiniteQuery({
    queryKey: [...changeQueryKeys.events(changeId), versionKey],
    queryFn: ({ pageParam }) =>
      getChangeEvents(changeId, pageParam === null ? {} : { cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
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
  const events = query.data?.pages.flatMap((page) => page.items) ?? [];
  if (events.length === 0) {
    return (
      <EmptyState
        icon={<History size={18} />}
        title={t("changes.history.emptyTitle")}
        body={t("changes.history.emptyBody")}
      />
    );
  }
  const translate = (key: TranslationKey, options?: Record<string, unknown>) => t(key, options);
  return (
    <Card className="p-0">
      <CardHeader title={t("changes.history.title")} />
      <ol className="divide-y divide-border/60">
        {events.map((event) => (
          <li key={event.id} className="grid gap-0.5 px-4 py-2 text-[12.5px]">
            <span className="text-foreground">
              {changeHistoryText(translate, event.action, event.detail)}
            </span>
            <span className="text-[11.5px] text-muted-foreground">
              {event.actor?.displayName ?? t("changes.history.system")} ·{" "}
              {formatAssetDateTime(event.createdAt, i18n.language)}
            </span>
            {typeof event.detail?.reason === "string" && event.detail.reason.length > 0 ? (
              <span className="text-[11.5px] text-muted-foreground">
                {t("changes.history.reason", { reason: event.detail.reason })}
              </span>
            ) : null}
            {typeof event.detail?.comment === "string" && event.detail.comment.length > 0 ? (
              <span className="text-[11.5px] text-muted-foreground">
                {t("changes.history.comment", { comment: event.detail.comment })}
              </span>
            ) : null}
          </li>
        ))}
      </ol>
      {query.hasNextPage ? (
        <div className="border-t border-border/60 px-4 py-2">
          <Button
            variant="outline"
            size="sm"
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
            data-testid="change-history-more"
          >
            {query.isFetchingNextPage ? t("ui.loading") : t("changes.history.loadMore")}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
