import { Lightbulb, ShieldQuestion, ThumbsDown, ThumbsUp } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { KnowledgeLifecycleActions } from "@/components/knowledge-base/knowledge-lifecycle-actions";
import { Avatar } from "@/components/ui/avatar";
import { Badge, MetaBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { RelativeTime } from "@/components/ui/relative-time";
import { directoryDisplayName, truncateIdentifier } from "@/lib/tickets/ticket-display";
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
  readonly ownerNames: ReadonlyMap<string, string>;
  readonly serviceNames: ReadonlyMap<string, string>;
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
): string | null {
  return (
    directoryDisplayName(ownerNames, item.ownerUserId) ??
    (item.ownerGroupId ? truncateIdentifier(item.ownerGroupId) : null)
  );
}

export function KnowledgeArticleList({
  items,
  canManageLifecycle,
  isFiltered,
  ownerNames,
  serviceNames,
  onFeedback,
}: KnowledgeArticleListProperties) {
  const { t, i18n } = useTranslation();
  if (items.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={isFiltered ? <ShieldQuestion size={18} /> : undefined}
          title={t(isFiltered ? "knowledgeBase.emptyFilterTitle" : "knowledgeBase.emptyTitle")}
          body={t(isFiltered ? "knowledgeBase.emptyFilterHint" : "knowledgeBase.emptyHint")}
        />
      </Card>
    );
  }
  return (
    <ul className="grid grid-cols-1 gap-3 xl:grid-cols-2">
      {items.map((item) => {
        const owner = ownerLabel(item, ownerNames);
        const serviceName =
          serviceNames.get(item.serviceId) ?? truncateIdentifier(item.serviceId);
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
                      className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground"
                      onClick={() => {
                        void submitKnowledgeFeedback(item.id, true).then(onFeedback);
                      }}
                    >
                      <ThumbsUp size={12} />
                    </button>
                    <button
                      type="button"
                      aria-label={t("knowledgeBase.notHelpful")}
                      className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground"
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
