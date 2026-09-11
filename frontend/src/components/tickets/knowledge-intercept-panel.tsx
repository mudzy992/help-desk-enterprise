import { Check, Send, ThumbsDown, ThumbsUp } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { errorTextClassName } from "@/components/ui/control";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import type { KnowledgeArticleResponse } from "@/services/knowledge-base-api";
import {
  getKnowledgeArticle,
  submitKnowledgeFeedback,
  type KnowledgeInterceptSuggestion,
} from "@/services/knowledge-base-api";
import { canContinueAfterKnowledgeIntercept } from "@/lib/tickets/can-continue-after-intercept";
import { mapTicketError, type TicketErrorKey } from "@/lib/tickets/map-ticket-error";

interface KnowledgeInterceptPanelProperties {
  readonly items: readonly KnowledgeInterceptSuggestion[];
  readonly helped: boolean;
  readonly onHelped: () => void;
  readonly onContinue: () => void;
  readonly onBack: () => void;
  readonly isSubmitting: boolean;
}

export function KnowledgeInterceptPanel({
  items,
  helped,
  onHelped,
  onContinue,
  onBack,
  isSubmitting,
}: KnowledgeInterceptPanelProperties) {
  const { t } = useTranslation();
  const [article, setArticle] = useState<KnowledgeArticleResponse | null>(null);
  const [errorKey, setErrorKey] = useState<TicketErrorKey | null>(null);
  const [isLoadingArticle, setIsLoadingArticle] = useState(false);

  const openArticle = async (articleId: string) => {
    setIsLoadingArticle(true);
    setErrorKey(null);
    try {
      setArticle(await getKnowledgeArticle(articleId));
    } catch (error) {
      setErrorKey(mapTicketError(error));
    } finally {
      setIsLoadingArticle(false);
    }
  };

  return (
    <div className="grid gap-3">
      <p className="text-[13px] leading-5 text-muted-foreground">{t("tickets.interceptIntro")}</p>
      {helped ? (
        <p className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-[13px] text-[#4ADE80]">
          {t("tickets.helpedSkip")}
        </p>
      ) : null}
      {canContinueAfterKnowledgeIntercept(items) && items.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">{t("tickets.interceptEmpty")}</p>
      ) : (
        <ul className="grid gap-3">
          {items.map((item) => (
            <li key={item.id} className="grid gap-2 rounded-lg border border-border bg-background/40 px-3 py-3 transition-colors duration-150 hover:border-[#31405C]">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-[13.5px] font-semibold text-foreground">{item.title}</h3>
                {item.isStale ? <Badge tone="warning">{t("knowledgeBase.stale")}</Badge> : null}
              </div>
              <p className="text-[12.5px] leading-5 text-muted-foreground">{item.bodyPreview}</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isLoadingArticle}
                  onClick={() => void openArticle(item.id)}
                >
                  {t("tickets.openArticle")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void submitKnowledgeFeedback(item.id, true);
                  }}
                >
                  <ThumbsUp size={13} /> {t("knowledgeBase.helpful")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void submitKnowledgeFeedback(item.id, false);
                  }}
                >
                  <ThumbsDown size={13} /> {t("knowledgeBase.notHelpful")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {errorKey ? <p className={errorTextClassName}>{t(errorKey)}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={onHelped}
          className="rounded-lg border border-success/30 bg-success/10 px-3 py-3 text-left transition-colors duration-150 hover:border-success/50"
        >
          <span className="flex items-center gap-2 text-[13px] font-medium text-[#4ADE80]">
            <Check size={15} strokeWidth={2} /> {t("tickets.helpedResolved")}
          </span>
        </button>
        <button
          type="button"
          disabled={isSubmitting}
          onClick={onContinue}
          className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-3 text-left transition-colors duration-150 hover:border-primary/60"
        >
          <span className="flex items-center gap-2 text-[13px] font-medium text-[#7FA8F5]">
            <Send size={15} strokeWidth={2} />
            {isSubmitting ? t("tickets.creating") : t("tickets.continueSend")}
          </span>
        </button>
      </div>
      <div>
        <Button type="button" variant="outline" onClick={onBack}>
          {t("tickets.backToForm")}
        </Button>
      </div>
      <Sheet open={article !== null} onOpenChange={(open) => !open && setArticle(null)}>
        <SheetContent side="right" className="flex w-full max-w-lg flex-col overflow-y-auto p-4">
          <SheetTitle>{article?.title ?? t("tickets.openArticle")}</SheetTitle>
          <SheetDescription className="sr-only">{t("tickets.openArticle")}</SheetDescription>
          <div className="mt-4 whitespace-pre-wrap text-[13.5px] leading-relaxed text-foreground">
            {article?.body}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
