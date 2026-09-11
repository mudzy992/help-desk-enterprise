import { useTranslation } from "react-i18next";
import { KnowledgeLifecycleActions } from "@/components/knowledge-base/knowledge-lifecycle-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { KnowledgeArticleResponse } from "@/services/knowledge-base-api";
import { submitKnowledgeFeedback } from "@/services/knowledge-base-api";

interface KnowledgeArticleListProperties {
  readonly items: readonly KnowledgeArticleResponse[];
  readonly canManageLifecycle: boolean;
  readonly onFeedback: () => Promise<void>;
}

function statusTone(status: string): "success" | "warning" | "neutral" {
  if (status === "PUBLISHED") {
    return "success";
  }
  if (status === "DEPRECATED" || status === "ARCHIVED") {
    return "warning";
  }
  return "neutral";
}

export function KnowledgeArticleList({
  items,
  canManageLifecycle,
  onFeedback,
}: KnowledgeArticleListProperties) {
  const { t } = useTranslation();
  if (items.length === 0) {
    return (
      <EmptyState
        title={t("knowledgeBase.emptyTitle")}
        body={t("knowledgeBase.emptyHint")}
      />
    );
  }
  return (
    <ul className="grid gap-3">
      {items.map((item) => (
        <li
          key={item.id}
          className="grid gap-2 rounded-lg border border-border bg-surface px-3 py-3 transition-colors duration-150 hover:border-[#31405C]"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-[13.5px] font-semibold text-foreground">{item.title}</h3>
            <span className="flex items-center gap-1.5">
              <Badge tone={statusTone(item.status)}>{item.status}</Badge>
              {item.isStale ? <Badge tone="warning">{t("knowledgeBase.stale")}</Badge> : null}
            </span>
          </div>
          <p className="text-[13px] leading-5 text-muted-foreground">{item.body.slice(0, 280)}</p>
          <p className="text-[12px] text-muted-foreground">
            {t("knowledgeBase.owner")}: {item.ownerUserId ?? item.ownerGroupId ?? "—"}
            {item.reviewDueAt
              ? ` · ${t("knowledgeBase.reviewDue")}: ${item.reviewDueAt}`
              : ""}
          </p>
          {item.status === "PUBLISHED" ? (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  void submitKnowledgeFeedback(item.id, true).then(onFeedback);
                }}
              >
                {t("knowledgeBase.helpful")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  void submitKnowledgeFeedback(item.id, false).then(onFeedback);
                }}
              >
                {t("knowledgeBase.notHelpful")}
              </Button>
            </div>
          ) : null}
          <KnowledgeLifecycleActions
            articleId={item.id}
            status={item.status}
            canManage={canManageLifecycle}
            onChanged={onFeedback}
          />
        </li>
      ))}
    </ul>
  );
}
