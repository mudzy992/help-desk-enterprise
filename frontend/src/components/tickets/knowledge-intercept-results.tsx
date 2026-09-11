import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { KnowledgeInterceptSuggestion } from "@/services/knowledge-base-api";
import { submitKnowledgeFeedback } from "@/services/knowledge-base-api";

interface KnowledgeInterceptResultsProperties {
  readonly items: readonly KnowledgeInterceptSuggestion[];
  readonly onHelped: () => void;
  readonly onContinue: () => void;
}

export function KnowledgeInterceptResults({
  items,
  onHelped,
  onContinue,
}: KnowledgeInterceptResultsProperties) {
  const { t } = useTranslation();
  if (items.length === 0) {
    return (
      <div className="mt-3 grid gap-3">
        <p className="text-body text-muted-foreground">
          {t("tickets.interceptEmpty")}
        </p>
        <div>
          <Button type="button" variant="secondary" onClick={onContinue}>
            {t("tickets.continueCreate")}
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="mt-3 grid gap-3">
      <p className="text-body text-muted-foreground">{t("tickets.interceptIntro")}</p>
      <ul className="divide-y divide-border border border-border">
        {items.map((item) => (
          <li key={item.id} className="grid gap-2 px-3 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-body font-medium text-foreground">{item.title}</h3>
              {item.isStale ? (
                <span className="text-metadata text-muted-foreground">
                  {t("knowledgeBase.stale")}
                </span>
              ) : null}
            </div>
            <p className="text-body text-muted-foreground">{item.bodyPreview}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  void submitKnowledgeFeedback(item.id, true).then(onHelped);
                }}
              >
                {t("knowledgeBase.helpful")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  void submitKnowledgeFeedback(item.id, false);
                }}
              >
                {t("knowledgeBase.notHelpful")}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <div>
        <Button type="button" variant="secondary" onClick={onContinue}>
          {t("tickets.continueCreate")}
        </Button>
      </div>
    </div>
  );
}
