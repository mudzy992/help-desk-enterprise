import { ArrowLeft, ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import type { DocsPageLink } from "@/services/docs-api";

/** Faza 3 (c): prethodna/sljedeća stranica unutar istog dijela (redoslijed s servera). */
export function DocsPager({
  previous,
  next,
}: {
  readonly previous: DocsPageLink | null;
  readonly next: DocsPageLink | null;
}) {
  const { t } = useTranslation();
  if (previous === null && next === null) {
    return null;
  }
  return (
    <nav aria-label={t("docs.pagerLabel")} className="mt-6 flex items-stretch justify-between gap-3 border-t border-border pt-4 print:hidden">
      <div className="min-w-0 flex-1">
        {previous === null ? null : (
          <Link
            className="group flex flex-col gap-0.5 rounded-md border border-border px-3 py-2 hover:bg-surface-hover"
            to={`/docs/${previous.slug}`}
          >
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <ArrowLeft size={13} strokeWidth={1.8} />
              {t("docs.previous")}
            </span>
            <span className="truncate text-[12.5px] font-medium text-foreground">{previous.title}</span>
          </Link>
        )}
      </div>
      <div className="min-w-0 flex-1">
        {next === null ? null : (
          <Link
            className="group flex flex-col items-end gap-0.5 rounded-md border border-border px-3 py-2 text-right hover:bg-surface-hover"
            to={`/docs/${next.slug}`}
          >
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              {t("docs.next")}
              <ArrowRight size={13} strokeWidth={1.8} />
            </span>
            <span className="truncate text-[12.5px] font-medium text-foreground">{next.title}</span>
          </Link>
        )}
      </div>
    </nav>
  );
}
