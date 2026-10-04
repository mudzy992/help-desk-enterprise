import { ThumbsDown, ThumbsUp } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { readDocsFeedback, saveDocsFeedback } from "@/lib/docs/docs-local";
import { cn } from "@/lib/utils";

/**
 * Faza 3 (d): „Je li ova stranica pomogla?“ — odgovor ostaje na uređaju
 * (`localStorage`), bez novih tabela i bez ličnih podataka. Razlog zašto nije
 * u audit-logu zapisan je u `REVIEW_ANALIZA.md` (`# Faza 3 — korak (d)`).
 */
export function DocsFeedback({ slug }: { readonly slug: string }) {
  const { t } = useTranslation();
  const [answer, setAnswer] = useState<"yes" | "no" | null>(null);

  useEffect(() => {
    setAnswer(readDocsFeedback(slug));
  }, [slug]);

  const choose = (value: "yes" | "no"): void => {
    saveDocsFeedback(slug, value);
    setAnswer(value);
  };

  return (
    <section aria-label={t("docs.feedback.label")} className="mt-6 flex flex-wrap items-center gap-3 border-t border-border pt-4 print:hidden">
      <p className="text-[12.5px] text-muted-foreground">{t("docs.feedback.question")}</p>
      <div className="flex items-center gap-1">
        <button
          aria-label={t("docs.feedback.yes")}
          aria-pressed={answer === "yes"}
          className={cn(
            "flex items-center gap-1.5 rounded-md border px-2 py-1 text-[12px]",
            answer === "yes"
              ? "border-success/40 bg-success/10 text-ok"
              : "border-border text-muted-foreground hover:bg-surface-hover hover:text-foreground",
          )}
          onClick={() => choose("yes")}
          type="button"
        >
          <ThumbsUp size={14} strokeWidth={1.9} />
          {t("docs.feedback.yes")}
        </button>
        <button
          aria-label={t("docs.feedback.no")}
          aria-pressed={answer === "no"}
          className={cn(
            "flex items-center gap-1.5 rounded-md border px-2 py-1 text-[12px]",
            answer === "no"
              ? "border-warning/40 bg-warning/10 text-warning"
              : "border-border text-muted-foreground hover:bg-surface-hover hover:text-foreground",
          )}
          onClick={() => choose("no")}
          type="button"
        >
          <ThumbsDown size={14} strokeWidth={1.9} />
          {t("docs.feedback.no")}
        </button>
      </div>
      {answer === null ? null : <p className="text-[12px] text-muted-foreground">{t("docs.feedback.thanks")}</p>}
    </section>
  );
}
