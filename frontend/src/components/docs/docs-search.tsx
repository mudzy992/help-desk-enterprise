import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { hintClassName } from "@/components/ui/control";
import { filterDocsByAudience, type DocsAudience } from "@/lib/docs/docs-audience";
import { docsPartLabel } from "@/lib/docs/docs-labels";
import { cn } from "@/lib/utils";
import type { DocsLoadError } from "@/lib/docs/use-docs";
import type { DocsSearchResponse } from "@/services/docs-api";

/** Faza 3 (c): polje pretrage i rezultati; `excerptParts` se markiraju lokalno. */
export function DocsSearch({
  query,
  onQueryChange,
  response,
  loading,
  error,
  audience,
}: {
  readonly query: string;
  readonly onQueryChange: (value: string) => void;
  readonly response: DocsSearchResponse | null;
  readonly loading: boolean;
  readonly error: DocsLoadError | null;
  readonly audience: DocsAudience;
}) {
  const { t } = useTranslation();
  const results = response === null ? [] : filterDocsByAudience(response.results, audience);

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="sr-only">{t("docs.searchLabel")}</span>
        <input
          autoComplete="off"
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:border-link"
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={t("docs.searchPlaceholder")}
          type="search"
          value={query}
        />
      </label>
      <p className={hintClassName}>{t("docs.searchHint")}</p>

      {error === null ? null : (
        <p className="text-[12.5px] text-danger">{t(error.key)}</p>
      )}

      {loading && response === null ? <PanelSkeleton label={t("docs.searching")} /> : null}

      {response !== null && results.length === 0 && !loading ? (
        <p className="text-[12.5px] text-muted-foreground">
          {response.results.length === 0
            ? t("docs.noResults", { query: response.query })
            : t("docs.emptyFilter")}
        </p>
      ) : null}

      {results.length > 0 ? (
        <ul className="divide-y divide-border/70 rounded-md border border-border">
          {results.map((result) => (
            <li key={result.slug}>
              <Link className="block px-3 py-2.5 hover:bg-surface-hover" to={`/docs/${result.slug}`}>
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-medium text-foreground">{result.title}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {docsPartLabel(t, { key: result.part, label: result.part })}
                  </span>
                </span>
                <span className="mt-1 block text-[12px] leading-5 text-muted-foreground">
                  {result.excerptParts.map((part, index) =>
                    part.match ? (
                      <mark key={index} className={cn("rounded bg-warning/20 px-0.5 text-foreground")}>
                        {part.text}
                      </mark>
                    ) : (
                      <span key={index}>{part.text}</span>
                    ),
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
