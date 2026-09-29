import { Star } from "lucide-react";
import { useId, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import {
  canSubmitKnowledgeRating,
  commentMaxLength,
  formatAverageRating,
  ratingAllowsComment,
} from "@/lib/knowledge-base/knowledge-portal";
import { cn } from "@/lib/utils";
import { rateKnowledgeArticle } from "@/services/knowledge-portal-api";

interface KnowledgeStarRatingProperties {
  readonly articleId: string;
  readonly viewerRating: number | null;
  readonly averageRating: number | null;
  readonly ratingCount: number;
  readonly onRated: () => Promise<void> | void;
}

const stars = [1, 2, 3, 4, 5] as const;

/**
 * Paket 2.9 (K1b, P1): 1-5 stars as a radio group (arrow keys move, Enter or
 * click selects). 4-5 stars are sent at once; 1-2 stars open "What is
 * missing?" (optional comment, max 500) before sending; 3 is sent at once.
 */
export function KnowledgeStarRating({
  articleId,
  viewerRating,
  averageRating,
  ratingCount,
  onRated,
}: KnowledgeStarRatingProperties) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const labelId = useId();
  const [hover, setHover] = useState<number | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const current = pending ?? viewerRating;
  const shown = hover ?? current ?? 0;

  const send = async (rating: number, text?: string) => {
    setIsSaving(true);
    try {
      await rateKnowledgeArticle(articleId, rating, text);
      toast({ tone: "success", title: t("knowledgeBase.portal.rating.thanks") });
      setPending(null);
      setComment("");
      await onRated();
    } catch {
      toast({ tone: "danger", title: t("knowledgeBase.portal.rating.failed") });
    } finally {
      setIsSaving(false);
    }
  };

  const choose = (rating: number) => {
    if (isSaving) return;
    if (ratingAllowsComment(rating)) {
      setPending(rating);
      return;
    }
    setPending(null);
    void send(rating);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, rating: number) => {
    const next =
      event.key === "ArrowRight" || event.key === "ArrowUp"
        ? Math.min(5, rating + 1)
        : event.key === "ArrowLeft" || event.key === "ArrowDown"
          ? Math.max(1, rating - 1)
          : null;
    if (next !== null) {
      event.preventDefault();
      const target = event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-star="${next}"]`);
      target?.focus();
    }
  };

  const average = formatAverageRating(averageRating, i18n.language);

  return (
    <div className="grid gap-2" data-testid="knowledge-star-rating">
      <div className="flex flex-wrap items-center gap-2">
        <span id={labelId} className="text-[11.5px] font-medium text-foreground">
          {t("knowledgeBase.portal.rating.question")}
        </span>
        <div
          role="radiogroup"
          aria-labelledby={labelId}
          className="flex items-center gap-0.5"
          onMouseLeave={() => setHover(null)}
        >
          {stars.map((rating) => {
            const active = rating <= shown;
            const checked = current === rating;
            return (
              <button
                key={rating}
                type="button"
                role="radio"
                data-star={rating}
                aria-checked={checked}
                tabIndex={checked || (current === null && rating === 1) ? 0 : -1}
                aria-label={t("knowledgeBase.portal.rating.starLabel", { count: rating })}
                disabled={isSaving}
                onMouseEnter={() => setHover(rating)}
                onFocus={() => setHover(rating)}
                onBlur={() => setHover(null)}
                onKeyDown={(event) => onKeyDown(event, rating)}
                onClick={() => choose(rating)}
                className="rounded-md p-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/70 disabled:opacity-60"
              >
                <Star
                  size={16}
                  aria-hidden="true"
                  className={cn(active ? "fill-warning text-warning" : "text-muted-foreground")}
                />
              </button>
            );
          })}
        </div>
        <span className="tnum text-[11px] text-muted-foreground">
          {average === null
            ? t("knowledgeBase.portal.rating.none")
            : t("knowledgeBase.portal.rating.summary", { average, count: ratingCount })}
        </span>
      </div>
      {pending !== null ? (
        <div className="grid gap-2 rounded-md border border-border bg-elevated/40 p-3">
          <label className="text-[12px] font-medium text-foreground" htmlFor={`${labelId}-comment`}>
            {t("knowledgeBase.portal.rating.missingQuestion")}
          </label>
          <Textarea
            id={`${labelId}-comment`}
            value={comment}
            maxLength={commentMaxLength}
            className="min-h-20"
            onChange={(event) => setComment(event.target.value)}
          />
          <p className="text-[11px] text-muted-foreground">{t("knowledgeBase.portal.rating.missingHint")}</p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="primary"
              disabled={isSaving || !canSubmitKnowledgeRating(pending, comment)}
              onClick={() => void send(pending, comment)}
            >
              {t("knowledgeBase.portal.rating.send")}
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={isSaving} onClick={() => setPending(null)}>
              {t("ui.cancel")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
