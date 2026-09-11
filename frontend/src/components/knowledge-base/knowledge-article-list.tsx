import { ThumbsDown, ThumbsUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { KnowledgeLifecycleActions } from "@/components/knowledge-base/knowledge-lifecycle-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
      <Card>
        <EmptyState
          title={t("knowledgeBase.emptyTitle")}
          body={t("knowledgeBase.emptyHint")}
        />
      </Card>
    );
  }
  return (
    <ul className="grid grid-cols-1 gap-3 xl:grid-cols-2">
      {items.map((item) => (
        <li key={item.id}>
          <Card className="h-full px-4 py-4 transition-colors duration-150 hover:border-[#31405C]">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="text-[14px] font-semibold leading-5 text-foreground">
                {item.title}
              </h3>
              <span className="flex items-center gap-1.5">
                <Badge tone={statusTone(item.status)}>{item.status}</Badge>
                {item.isStale ? <Badge tone="warning">{t("knowledgeBase.stale")}</Badge> : null}
              </span>
            </div>
            <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-5 text-muted-foreground">
              {item.body.slice(0, 280)}
            </p>
            <p className="mt-2 text-[12px] text-muted-foreground">
              {t("knowledgeBase.owner")}: {item.ownerUserId ?? item.ownerGroupId ?? "—"}
              {item.reviewDueAt
                ? ` · ${t("knowledgeBase.reviewDue")}: ${item.reviewDueAt}`
                : ""}
            </p>
            {item.status === "PUBLISHED" ? (
              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void submitKnowledgeFeedback(item.id, true).then(onFeedback);
                  }}
                >
                  <ThumbsUp size={13} /> {t("knowledgeBase.helpful")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void submitKnowledgeFeedback(item.id, false).then(onFeedback);
                  }}
                >
                  <ThumbsDown size={13} /> {t("knowledgeBase.notHelpful")}
                </Button>
              </div>
            ) : null}
            <KnowledgeLifecycleActions
              articleId={item.id}
              status={item.status}
              canManage={canManageLifecycle}
              onChanged={onFeedback}
            />
          </Card>
        </li>
      ))}
    </ul>
  );
}
