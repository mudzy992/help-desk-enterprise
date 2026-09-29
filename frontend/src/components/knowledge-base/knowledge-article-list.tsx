import { Eye, Lightbulb, ShieldQuestion, Star } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { KnowledgeLifecycleActions } from "@/components/knowledge-base/knowledge-lifecycle-actions";
import { Avatar } from "@/components/ui/avatar";
import { Badge, MetaBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { RelativeTime } from "@/components/ui/relative-time";
import { formatAverageRating } from "@/lib/knowledge-base/knowledge-portal";
import { pickName } from "@/lib/tickets/ticket-names";
import { cn } from "@/lib/utils";
import type {
  KnowledgeArticleResponse,
  KnowledgeArticleStatus,
} from "@/services/knowledge-base-api";

interface KnowledgeArticleListProperties {
  readonly items: readonly KnowledgeArticleResponse[];
  readonly canManageLifecycle: boolean;
  readonly isFiltered: boolean;
  readonly searchQuery: string;
  readonly ownerNames: ReadonlyMap<string, string>;
  readonly serviceNames: ReadonlyMap<string, string>;
  readonly canWrite: boolean;
  readonly onCreate: () => void;
  readonly onCreateForQuery: () => void;
  readonly onClearFilters: () => void;
  /** Refresh after a lifecycle change (rating moved to the article page, Paket 2.9 K1b). */
  readonly onFeedback: () => Promise<void>;
}

function statusTone(status: KnowledgeArticleStatus) {
  if (status === "PUBLISHED") {
    return "success" as const;
  }
  if (status === "IN_REVIEW" || status === "ARCHIVED") {
    return "warning" as const;
  }
  return "neutral" as const;
}

function ownerLabel(
  item: KnowledgeArticleResponse,
  ownerNames: ReadonlyMap<string, string>,
  unknown: string,
): string | null {
  if (item.ownerUserId !== null) {
    return pickName(item.ownerName, ownerNames.get(item.ownerUserId)) ?? unknown;
  }
  if (item.ownerGroupId !== null) {
    return pickName(item.ownerGroupName) ?? unknown;
  }
  return null;
}

export function KnowledgeArticleList({
  items,
  canManageLifecycle,
  isFiltered,
  searchQuery,
  ownerNames,
  serviceNames,
  canWrite,
  onCreate,
  onCreateForQuery,
  onClearFilters,
  onFeedback,
}: KnowledgeArticleListProperties) {
  const { t, i18n } = useTranslation();
  if (items.length === 0) {
    const hasQuery = searchQuery.trim().length > 0;
    return (
      <Card>
        <EmptyState
          icon={isFiltered ? <ShieldQuestion size={18} /> : undefined}
          title={t(isFiltered ? "knowledgeBase.emptyFilterTitle" : "knowledgeBase.emptyTitle")}
          body={t(
            hasQuery
              ? "knowledgeBase.emptyQueryHint"
              : isFiltered
                ? "knowledgeBase.emptyFilterHint"
                : "knowledgeBase.emptyHint",
          )}
          action={
            hasQuery && canWrite ? (
              <Button type="button" size="sm" variant="primary" onClick={onCreateForQuery}>
                {t("knowledgeBase.createForQuery", { query: searchQuery.trim() })}
              </Button>
            ) : isFiltered ? (
              <Button type="button" size="sm" variant="outline" onClick={onClearFilters}>
                {t("knowledgeBase.clearFilters")}
              </Button>
            ) : canWrite ? (
              <Button type="button" size="sm" onClick={onCreate}>
                {t("knowledgeBase.createAction")}
              </Button>
            ) : null
          }
        />
      </Card>
    );
  }
  return (
    <ul className="fade-in grid grid-cols-1 gap-3 xl:grid-cols-2">
      {items.map((item) => {
        const owner = ownerLabel(item, ownerNames, t("tickets.detail.unknownUser"));
        const serviceName =
          pickName(item.serviceName, serviceNames.get(item.serviceId)) ?? "—";
        return (
          <li key={item.id}>
            <Card className="group h-full transition-colors hover:border-line-strong">
              <div className="px-4 pt-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="tnum text-[10.5px] font-medium text-muted-foreground">
                      {item.slug} · {serviceName}
                    </p>
                    <Link
                      to={`/knowledge-base/${item.id}`}
                      className="mt-0.5 block text-[14px] font-semibold leading-5 text-foreground transition-colors group-hover:text-link"
                    >
                      {item.title}
                    </Link>
                  </div>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <MetaBadge
                      meta={{
                        label: t(`knowledgeBase.status.${item.status}`),
                        tone: statusTone(item.status),
                      }}
                    />
                    {item.isStale ? (
                      <Badge tone="warning">{t("knowledgeBase.stale")}</Badge>
                    ) : null}
                  </span>
                </div>
                <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-5 text-muted-foreground">
                  {item.body.slice(0, 280)}
                </p>
              </div>
              <div className="mt-3 flex items-center gap-3 border-t border-border/70 px-4 py-2.5 text-[11px] text-muted-foreground">
                {owner ? (
                  <span className="flex min-w-0 items-center gap-1">
                    <Avatar name={owner} size="xs" />
                    <span className="truncate">{owner}</span>
                  </span>
                ) : (
                  <span>{t("knowledgeBase.owner")}: —</span>
                )}
                {item.status === "PUBLISHED" ? (
                  <span className="tnum ml-auto flex items-center gap-2">
                    {item.averageRating !== null && item.averageRating !== undefined ? (
                      <span className="flex items-center gap-0.5">
                        <Star size={11} aria-hidden="true" className="fill-warning text-warning" />
                        <span aria-hidden="true">{formatAverageRating(item.averageRating, i18n.language)}</span>
                        <span className="sr-only">
                          {t("knowledgeBase.portal.rating.summary", {
                            average: formatAverageRating(item.averageRating, i18n.language),
                            count: item.ratingCount ?? 0,
                          })}
                        </span>
                      </span>
                    ) : null}
                    <span className="flex items-center gap-0.5">
                      <Eye size={11} aria-hidden="true" />
                      <span aria-hidden="true">{item.viewCount ?? 0}</span>
                      <span className="sr-only">{t("knowledgeBase.portal.views", { count: item.viewCount ?? 0 })}</span>
                    </span>
                  </span>
                ) : null}
              </div>
              <div className="flex items-center justify-between px-4 pb-3 text-[10.5px] text-muted-foreground">
                <span className="tnum">
                  {t("knowledgeBase.updatedAt")}{" "}
                  <RelativeTime value={item.updatedAt} locale={i18n.language} />
                </span>
                {item.reviewDueAt ? (
                  <span
                    className={cn(
                      "tnum flex items-center gap-1",
                      item.isStale && "text-warning",
                    )}
                  >
                    {item.isStale ? <Lightbulb size={10.5} /> : null}
                    {t("knowledgeBase.reviewDue")}:{" "}
                    <RelativeTime value={item.reviewDueAt} locale={i18n.language} />
                  </span>
                ) : null}
              </div>
              <div className="px-4 pb-3">
                <KnowledgeLifecycleActions
                  articleId={item.id}
                  status={item.status}
                  canManage={canManageLifecycle}
                  onChanged={onFeedback}
                />
              </div>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
