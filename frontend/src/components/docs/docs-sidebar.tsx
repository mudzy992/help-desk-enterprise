import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { filterDocsByAudience, type DocsAudience } from "@/lib/docs/docs-audience";
import { docsPartLabel } from "@/lib/docs/docs-labels";
import { cn } from "@/lib/utils";
import type { DocsNavigation } from "@/services/docs-api";

/** Faza 3 (c): lijevi nav — dijelovi i stranice, filtrirano po publici. */
export function DocsSidebar({
  navigation,
  activeSlug,
  audience,
  onNavigate,
}: {
  readonly navigation: DocsNavigation;
  readonly activeSlug: string | null;
  readonly audience: DocsAudience;
  readonly onNavigate?: () => void;
}) {
  const { t } = useTranslation();
  const parts = navigation.parts
    .map((part) => ({ ...part, pages: filterDocsByAudience(part.pages, audience) }))
    .filter((part) => part.pages.length > 0);

  if (parts.length === 0) {
    return <p className="px-1 text-[12px] text-muted-foreground">{t("docs.emptyFilter")}</p>;
  }

  return (
    <nav aria-label={t("docs.navigationLabel")} className="space-y-4">
      {parts.map((part) => (
        <div key={part.key}>
          <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {docsPartLabel(t, part)}
          </p>
          <ul className="space-y-0.5">
            {part.pages.map((page) => {
              const active = page.slug === activeSlug;
              return (
                <li key={page.slug}>
                  <Link
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "block rounded-md px-2 py-1 text-[12.5px] leading-5",
                      active
                        ? "bg-elevated font-medium text-foreground"
                        : "text-muted-foreground hover:bg-surface-hover hover:text-foreground",
                    )}
                    onClick={onNavigate}
                    to={`/docs/${page.slug}`}
                  >
                    {page.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
