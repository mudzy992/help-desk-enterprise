import { Lightbulb, ShieldQuestion, ThumbsDown, ThumbsUp } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { KnowledgeLifecycleActions } from "@/components/knowledge-base/knowledge-lifecycle-actions";
import { Avatar } from "@/components/ui/avatar";
import { Badge, MetaBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { RelativeTime } from "@/components/ui/relative-time";
import { pickName } from "@/lib/tickets/ticket-names";
import { cn } from "@/lib/utils";
import type {
  KnowledgeArticleResponse,
  KnowledgeArticleStatus,
} from "@/services/knowledge-base-api";
import { submitKnowledgeFeedback } from "@/services/knowledge-base-api";

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
    <ul className="grid grid-cols-1 gap-3 xl:grid-cols-2">
      {items.map((item) => {
        const owner = ownerLabel(item, ownerNames, t("tickets.detail.unknownUser"));
        const serviceName =
          pickName(item.serviceName, serviceNames.get(item.serviceId)) ?? "—";
        return (
          <li key={item.id}>
            <Card className="group h-full transition-all hover:border-[#31405C]">
              <div className="px-4 pt-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="tnum text-[10.5px] font-medium text-muted-foreground/60">
                      {item.slug} · {serviceName}
                    </p>
                    <Link
                      to={`/knowledge-base/${item.id}`}
                      className="mt-0.5 block text-[14px] font-semibold leading-5 text-foreground transition-colors group-hover:text-[#7FA8F5]"
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
              <div className="mt-3 flex items-center gap-3 border-t border-border/50 px-4 py-2.5 text-[11px] text-muted-foreground">
                {owner ? (
                  <span className="flex min-w-0 items-center gap-1">
                    <Avatar name={owner} size="xs" />
                    <span className="truncate">{owner}</span>
                  </span>
                ) : (
                  <span>{t("knowledgeBase.owner")}: —</span>
                )}
                {item.status === "PUBLISHED" ? (
                  <div className="ml-auto flex items-center gap-0.5">
                    <button
                      type="button"
                      aria-label={t("knowledgeBase.helpful")}
                      className={cn(
                        "rounded-md border p-1.5 transition-colors",
                        item.viewerFeedback === true
                          ? "border-success/45 bg-success/12 text-[#4ADE80]"
                          : "border-border text-muted-foreground hover:bg-elevated hover:text-foreground",
                      )}
                      onClick={() => {
                        void submitKnowledgeFeedback(item.id, true).then(onFeedback);
                      }}
                    >
                      <ThumbsUp size={12} />
                    </button>
                    <button
                      type="button"
                      aria-label={t("knowledgeBase.notHelpful")}
                      className={cn(
                        "rounded-md border p-1.5 transition-colors",
                        item.viewerFeedback === false
                          ? "border-danger/45 bg-danger/12 text-danger"
                          : "border-border text-muted-foreground hover:bg-elevated hover:text-foreground",
                      )}
                      onClick={() => {
                        void submitKnowledgeFeedback(item.id, false).then(onFeedback);
                      }}
                    >
                      <ThumbsDown size={12} />
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="flex items-center justify-between px-4 pb-3 text-[10.5px] text-muted-foreground/60">
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
