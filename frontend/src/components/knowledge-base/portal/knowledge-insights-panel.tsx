import { Check, Star } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RelativeTime } from "@/components/ui/relative-time";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { formatAverageRating } from "@/lib/knowledge-base/knowledge-portal";
import { mapApiError, readApiRequestId, type ApiErrorKey } from "@/lib/map-api-error";
import {
  getKnowledgeInsights,
  listKnowledgeInsightComments,
  resolveKnowledgeComment,
  type KnowledgeInsights,
  type KnowledgePortalArticle,
} from "@/services/knowledge-portal-api";

/**
 * Paket 2.9 (K1b, §2.4): content insights for curators — most viewed (30
 * days), lowest rated (min. votes), not viewed for 90 days and the open
 * "what is missing" comments of articles the viewer may edit.
 */
export function KnowledgeInsightsPanel() {
  const { t, i18n } = useTranslation();
  const [insights, setInsights] = useState<KnowledgeInsights | null>(null);
  const [errorKey, setErrorKey] = useState<ApiErrorKey | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  // W7.91: a click in flight is visible and unclickable — that is the optimistic half of the contract.
  const [resolvingIds, setResolvingIds] = useState<readonly string[]>([]);
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      setInsights(await getKnowledgeInsights());
    } catch (error) {
      setErrorKey(mapApiError(error));
      setRequestId(readApiRequestId(error));
    }
  }, []);

  /**
   * W7.90 (`BA-knowledge-base-17`): the feed is a page now. Resolving a comment reloads the first page;
   * "load more" appends the next one, keyed by the cursor the server handed out.
   */
  const loadMoreComments = useCallback(async () => {
    if (insights === null || insights.openComments.nextCursor === null) return;
    setIsLoadingMore(true);
    try {
      const page = await listKnowledgeInsightComments({
        cursor: insights.openComments.nextCursor,
      });
      setInsights((current) =>
        current === null
          ? current
          : {
              ...current,
              openComments: {
                items: [...current.openComments.items, ...page.items],
                hasMore: page.hasMore,
                nextCursor: page.nextCursor,
              },
            },
      );
    } catch (error) {
      setErrorKey(mapApiError(error));
      setRequestId(readApiRequestId(error));
    } finally {
      setIsLoadingMore(false);
    }
  }, [insights]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * W7.91 (`BA-knowledge-base-18`): resolving used to be fire-and-forget — no pending state, no actor and
   * no way to notice that somebody else handled the comment first. Now the row leaves the list as soon as
   * the server confirms, and a competing resolve is reported instead of swallowed.
   */
  const resolveComment = useCallback(
    async (feedbackId: string) => {
      if (resolvingIds.includes(feedbackId)) return;
      setResolvingIds((current) => [...current, feedbackId]);
      try {
        const resolution = await resolveKnowledgeComment(feedbackId);
        setInsights((current) =>
          current === null
            ? current
            : {
                ...current,
                openComments: {
                  ...current.openComments,
                  items: current.openComments.items.filter((item) => item.id !== feedbackId),
                },
              },
        );
        if (resolution.alreadyResolved) {
          toast({
            tone: "info",
            title: t("knowledgeBase.portal.insights.alreadyResolved"),
          });
        }
        void load();
      } catch (error) {
        setErrorKey(mapApiError(error));
        setRequestId(readApiRequestId(error));
      } finally {
        setResolvingIds((current) => current.filter((id) => id !== feedbackId));
      }
    },
    [load, resolvingIds, t, toast],
  );

  if (errorKey !== null) return <ApiErrorText messageKey={errorKey} requestId={requestId} />;
  if (insights === null)
    return <PanelSkeleton className="mt-0" label={t("knowledgeBase.portal.insights.title")} />;

  const rating = (article: KnowledgePortalArticle) => {
    const average = formatAverageRating(article.averageRating, i18n.language);
    return average === null
      ? t("knowledgeBase.portal.rating.none")
      : t("knowledgeBase.portal.rating.summary", { average, count: article.ratingCount });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2" data-testid="knowledge-insights">
      <InsightList
        title={t("knowledgeBase.portal.insights.mostViewed")}
        empty={t("knowledgeBase.portal.insights.emptyViews")}
        items={insights.mostViewed.map((article) => ({
          id: article.id,
          title: article.title,
          meta: t("knowledgeBase.portal.views", { count: article.views30d }),
        }))}
      />
      <InsightList
        title={t("knowledgeBase.portal.insights.lowestRated", {
          count: insights.thresholds.minRatings,
        })}
        empty={t("knowledgeBase.portal.insights.emptyRated")}
        items={insights.lowestRated.map((article) => ({
          id: article.id,
          title: article.title,
          meta: rating(article),
        }))}
      />
      <InsightList
        title={t("knowledgeBase.portal.insights.notViewed", {
          count: insights.thresholds.notViewedDays,
        })}
        empty={t("knowledgeBase.portal.insights.emptyNotViewed")}
        items={insights.notViewed.map((article) => ({
          id: article.id,
          title: article.title,
          meta: t("knowledgeBase.portal.views", { count: article.viewCount }),
        }))}
      />
      <Card className="p-4">
        <h2 className="text-[13px] font-semibold text-foreground">
          {t("knowledgeBase.portal.insights.comments")}
        </h2>
        {insights.openComments.items.length === 0 ? (
          <p className="mt-2 text-[12px] text-muted-foreground">
            {t("knowledgeBase.portal.insights.emptyComments")}
          </p>
        ) : (
          <ul className="mt-2 grid gap-2">
            {insights.openComments.items.map((comment) => (
              <li key={comment.id} className="rounded-md border border-border/70 px-3 py-2">
                <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <Link
                    to={`/knowledge-base/${comment.articleId}`}
                    className="font-medium text-link hover:underline"
                  >
                    {comment.articleTitle}
                  </Link>
                  <span className="tnum flex items-center gap-1">
                    <Star size={11} aria-hidden="true" className="fill-warning text-warning" />
                    <span className="sr-only">
                      {t("knowledgeBase.portal.rating.starLabel", { count: comment.rating })}
                    </span>
                    <span aria-hidden="true">{comment.rating}</span>
                    <RelativeTime value={comment.createdAt} locale={i18n.language} />
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-[12.5px] text-foreground">
                  {comment.comment}
                </p>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  className="mt-1"
                  disabled={resolvingIds.includes(comment.id)}
                  aria-busy={resolvingIds.includes(comment.id)}
                  onClick={() => void resolveComment(comment.id)}
                >
                  <Check size={12} aria-hidden="true" />{" "}
                  {resolvingIds.includes(comment.id)
                    ? t("knowledgeBase.portal.insights.resolving")
                    : t("knowledgeBase.portal.insights.resolve")}
                </Button>
              </li>
            ))}
          </ul>
        )}
        {insights.openComments.hasMore ? (
          <div className="mt-2 grid gap-1.5" data-testid="knowledge-insights-more-comments">
            <p className="text-[11px] text-muted-foreground">
              {t("knowledgeBase.portal.insights.commentsTruncated", {
                count: insights.openComments.items.length,
              })}
            </p>
            <Button
              type="button"
              size="xs"
              variant="outline"
              disabled={isLoadingMore}
              onClick={() => void loadMoreComments()}
            >
              {t("knowledgeBase.portal.insights.loadMoreComments")}
            </Button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}

function InsightList({
  title,
  empty,
  items,
}: {
  readonly title: string;
  readonly empty: string;
  readonly items: readonly {
    readonly id: string;
    readonly title: string;
    readonly meta: ReactNode;
  }[];
}) {
  return (
    <Card className="p-4">
      <h2 className="text-[13px] font-semibold text-foreground">{title}</h2>
      {items.length === 0 ? (
        <p className="mt-2 text-[12px] text-muted-foreground">{empty}</p>
      ) : (
        <ol className="mt-2 grid gap-1.5">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 text-[12.5px]">
              <Link
                to={`/knowledge-base/${item.id}`}
                className="min-w-0 truncate text-foreground hover:text-link hover:underline"
              >
                {item.title}
              </Link>
              <span className="tnum shrink-0 text-[11px] text-muted-foreground">{item.meta}</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
