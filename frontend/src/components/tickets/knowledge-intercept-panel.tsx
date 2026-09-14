import { BookOpen, Check, ChevronRight, Lightbulb, ThumbsDown, ThumbsUp } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { errorTextClassName } from "@/components/ui/control";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { KnowledgeArticleResponse } from "@/services/knowledge-base-api";
import {
  getKnowledgeArticle,
  submitKnowledgeFeedback,
  type KnowledgeInterceptSuggestion,
} from "@/services/knowledge-base-api";
import { canContinueAfterKnowledgeIntercept } from "@/lib/tickets/can-continue-after-intercept";
import { mapTicketError, type TicketErrorKey } from "@/lib/tickets/map-ticket-error";
import { ticketText } from "@/lib/tickets/ticket-text";

interface KnowledgeInterceptPanelProperties {
  readonly items: readonly KnowledgeInterceptSuggestion[];
  readonly helped: boolean;
  readonly onHelped: () => void;
  readonly onContinue: () => void;
  readonly isSubmitting: boolean;
}

export function KnowledgeInterceptPanel({
  items,
  helped,
  onHelped,
  onContinue,
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

  const showEmpty = canContinueAfterKnowledgeIntercept(items) && items.length === 0;

  return (
    <div className="grid gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[14px] font-semibold text-foreground">
            <Lightbulb size={15} className="text-warning" /> {t("tickets.interceptIntroTitle")}
          </h2>
          <p className="mt-0.5 max-w-lg text-[12px] leading-5 text-muted-foreground">
            {t("tickets.interceptIntro")}
          </p>
        </div>
        <Badge tone="neutral" dot={false}>
          {t("tickets.interceptRequired")}
        </Badge>
      </div>
      {showEmpty ? (
        <EmptyState
          icon={<BookOpen size={18} />}
          title={t("tickets.interceptEmptyTitle")}
          body={t("tickets.interceptEmpty")}
        />
      ) : (
        <ul className="grid gap-3">
          {items.map((item) => (
            <li
              key={item.id}
              className={cn(
                "grid gap-2 rounded-lg border border-border bg-background/40 px-4 py-4 transition-all duration-150",
                helped ? "opacity-40" : "hover:border-[#31405C]",
              )}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-[13px] font-medium text-[#7FA8F5]">{item.title}</h3>
                {item.isStale ? <Badge tone="warning">{t("knowledgeBase.stale")}</Badge> : null}
              </div>
              <p className="text-[12px] leading-5 text-muted-foreground">{item.bodyPreview}</p>
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
      {errorKey ? <p className={errorTextClassName}>{ticketText(t, errorKey)}</p> : null}
      <div className="grid gap-2.5 md:grid-cols-2">
        <button
          type="button"
          onClick={onHelped}
          className={cn(
            "rounded-lg border p-4 text-left transition-all duration-150",
            helped ? "border-success/50 bg-success/10" : "border-border bg-background/40 hover:border-success/40",
          )}
        >
          <p className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
            <Check size={15} className="text-[#4ADE80]" /> {t("tickets.helpedResolved")}
          </p>
          <p className="mt-1 text-[11.5px] leading-[18px] text-muted-foreground">
            {t("tickets.helpedResolvedHint")}
          </p>
        </button>
        <button
          type="button"
          disabled={isSubmitting}
          onClick={onContinue}
          className="rounded-lg border border-border bg-background/40 p-4 text-left transition-all duration-150 hover:border-primary/40"
        >
          <p className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
            <ChevronRight size={15} className="text-[#7FA8F5]" />
            {t("tickets.continueSend")}
          </p>
          <p className="mt-1 text-[11.5px] leading-[18px] text-muted-foreground">
            {t("tickets.continueSendHint")}
          </p>
        </button>
      </div>
      {helped ? (
        <div className="rounded-md border border-success/30 bg-success/10 px-4 py-3 text-[12.5px] text-foreground/90">
          {t("tickets.helpedSkip")}
        </div>
      ) : null}
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
