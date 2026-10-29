import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { MarkdownView } from "@/components/privacy/markdown-view";
import { Button } from "@/components/ui/button";
import { paginateWhatsNewMarkdown } from "@/lib/docs/paginate-whats-new";

interface DocsWhatsNewProperties {
  readonly headingIds: readonly string[];
  readonly markdown: string;
  readonly onPageChange: (page: number) => void;
  readonly page: number;
}

export function DocsWhatsNew({ headingIds, markdown, onPageChange, page }: DocsWhatsNewProperties) {
  const { t } = useTranslation();
  const result = useMemo(() => paginateWhatsNewMarkdown(markdown, page), [markdown, page]);

  useEffect(() => {
    if (result.page !== page) {
      onPageChange(result.page);
    }
  }, [onPageChange, page, result.page]);

  const pagination =
    result.totalItems === 0 ? null : (
      <nav
        aria-label={t("docs.whatsNewPaginationLabel")}
        className="my-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface px-3 py-2 print:hidden"
      >
        <p className="text-[12px] text-muted-foreground">
          {t("docs.whatsNewRange", {
            first: result.firstItem,
            last: result.lastItem,
            total: result.totalItems,
          })}
        </p>
        <div className="flex items-center gap-2">
          <Button
            aria-label={t("docs.previousChangesPage")}
            disabled={result.page <= 1}
            onClick={() => onPageChange(result.page - 1)}
            size="sm"
            variant="secondary"
          >
            <ChevronLeft size={14} strokeWidth={1.8} />
            {t("docs.previous")}
          </Button>
          <span
            aria-live="polite"
            className="min-w-16 text-center text-[12px] text-muted-foreground"
          >
            {t("docs.pageOf", { page: result.page, total: result.totalPages })}
          </span>
          <Button
            aria-label={t("docs.nextChangesPage")}
            disabled={result.page >= result.totalPages}
            onClick={() => onPageChange(result.page + 1)}
            size="sm"
            variant="secondary"
          >
            {t("docs.next")}
            <ChevronRight size={14} strokeWidth={1.8} />
          </Button>
        </div>
      </nav>
    );

  return (
    <MarkdownView
      headingIds={headingIds}
      renderTableNavigation={() => pagination}
      source={result.markdown}
    />
  );
}
