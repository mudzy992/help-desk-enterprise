import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { KnowledgeArticleResponse } from "@/services/knowledge-base-api";
import { submitKnowledgeFeedback } from "@/services/knowledge-base-api";

interface KnowledgeArticleListProperties {
  readonly items: readonly KnowledgeArticleResponse[];
  readonly onFeedback: () => Promise<void>;
}

export function KnowledgeArticleList({
  items,
  onFeedback,
}: KnowledgeArticleListProperties) {
  const { t } = useTranslation();
  if (items.length === 0) {
    return (
      <p className="mt-3 text-body text-muted-foreground">
        {t("knowledgeBase.empty")}
      </p>
    );
  }
  return (
    <ul className="mt-3 divide-y divide-border border border-border">
      {items.map((item) => (
        <li key={item.id} className="grid gap-2 px-3 py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-body font-medium text-foreground">{item.title}</h3>
            <span className="text-metadata text-muted-foreground">
              {item.status}
              {item.isStale ? ` · ${t("knowledgeBase.stale")}` : ""}
            </span>
          </div>
          <p className="text-body text-muted-foreground">{item.body.slice(0, 280)}</p>
          <p className="text-metadata text-muted-foreground">
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
        </li>
      ))}
    </ul>
  );
}
