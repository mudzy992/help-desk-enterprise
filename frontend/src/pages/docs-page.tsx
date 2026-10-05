import { BookOpen, Menu, Printer, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { DocsBreadcrumbs } from "@/components/docs/docs-breadcrumbs";
import { DocsEmptyState } from "@/components/docs/docs-empty-state";
import { DocsFeedback } from "@/components/docs/docs-feedback";
import { DocsPager } from "@/components/docs/docs-pager";
import { DocsRoleFilter } from "@/components/docs/docs-role-filter";
import { DocsSearch } from "@/components/docs/docs-search";
import { DocsSidebar } from "@/components/docs/docs-sidebar";
import { DocsToc } from "@/components/docs/docs-toc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { useDocsNavigation, useDocsPage, useDocsSearch } from "@/lib/docs/use-docs";
import { matchesDocsAudience, type DocsAudience } from "@/lib/docs/docs-audience";
import { readRecentDocs, rememberRecentDoc } from "@/lib/docs/docs-local";
import { formatCivilDate } from "@/lib/format-civil-date";
import { cn } from "@/lib/utils";
import { MarkdownView } from "@/components/privacy/markdown-view";

/**
 * Faza 3 (c): `/docs` i `/docs/:slug`. Jedna stranica, dvije kolone (lijevi nav
 * i, na širokim ekranima, desni TOC), pretraga kroz `?q=`, filter po publici.
 * Sadržaj dolazi sa servera koji je već filtriran po ulozi korisnika.
 */
export function DocsPage() {
  const { t, i18n } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const [audience, setAudience] = useState<DocsAudience>("all");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [recentSlugs, setRecentSlugs] = useState<readonly string[]>([]);
  const searching = query.trim().length >= 2;
  // EN sadržaj stranica nije preveden (dizajn §10): kad je UI na engleskom,
  // korisnik to mora znati prije nego što počne čitati.
  const contentLanguageNotice = i18n.language.startsWith("en");

  const { navigation, loading: navigationLoading, error: navigationError, reload } = useDocsNavigation();
  const { page, loading: pageLoading, error: pageError } = useDocsPage(searching ? null : (slug ?? null));
  const { response, loading: searchLoading, error: searchError } = useDocsSearch(query);

  const parts = navigation?.parts ?? [];
  const firstSlug = parts.flatMap((part) => part.pages)[0]?.slug ?? null;
  const activePart = parts.find((part) => part.pages.some((entry) => entry.slug === (slug ?? ""))) ?? null;
  const updatedAt = page?.updatedAt ?? null;
  const formattedDate =
    updatedAt === null
      ? t("docs.updatedAtUnknown")
      : (formatCivilDate(updatedAt, t) ?? t("docs.updatedAtUnknown"));

  useEffect(() => {
    setRecentSlugs(readRecentDocs());
  }, [navigation]);

  useEffect(() => {
    if (page !== null) {
      setRecentSlugs(rememberRecentDoc(page.slug));
    }
  }, [page]);

  const printPage = useCallback((): void => {
    window.print();
  }, []);

  const setQuery = (value: string): void => {
    const next = new URLSearchParams(searchParams);
    if (value.trim().length === 0) {
      next.delete("q");
    } else {
      next.set("q", value);
    }
    setSearchParams(next, { replace: true });
  };

  if (navigationError !== null) {
    const unavailable = navigationError.status === 503;
    return (
      <div className="mx-auto max-w-3xl">
        <DocsEmptyState
          body={unavailable ? t("docs.unavailableBody") : t(navigationError.key)}
          kind={unavailable ? "unavailable" : "empty"}
          title={unavailable ? t("docs.unavailableTitle") : t("docs.errorTitle")}
        />
        <div className="mt-2 flex justify-center">
          <Button onClick={() => void reload()} size="sm" variant="secondary">
            <RefreshCw size={14} strokeWidth={1.8} />
            {t("docs.retry")}
          </Button>
        </div>
      </div>
    );
  }

  if (navigationLoading && navigation === null) {
    return (
      <div className="mx-auto max-w-5xl">
        <PanelSkeleton label={t("docs.loading")} />
      </div>
    );
  }

  // Bez sluga i bez pretrage: prva dostupna stranica (ili prazno stanje).
  if (slug === undefined && !searching) {
    if (firstSlug !== null) {
      return <Navigate replace to={`/docs/${firstSlug}`} />;
    }
    return (
      <div className="mx-auto max-w-3xl">
        <DocsEmptyState body={t("docs.emptyBody")} kind="empty" title={t("docs.emptyTitle")} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:gap-6">
      <aside className="print:hidden lg:w-56 lg:shrink-0 lg:border-r lg:border-border lg:pr-4">
        <button
          aria-expanded={sidebarOpen}
          className="flex w-full items-center justify-between rounded-md border border-border bg-surface px-3 py-2 text-[12.5px] font-medium text-foreground lg:hidden"
          onClick={() => setSidebarOpen((open) => !open)}
          type="button"
        >
          <span className="flex items-center gap-2">
            <Menu size={15} strokeWidth={1.8} />
            {t("docs.navigationLabel")}
          </span>
          {sidebarOpen ? <X size={15} strokeWidth={1.8} /> : null}
        </button>
        <div className={cn("mt-3", sidebarOpen ? "block" : "hidden lg:block")}>
          {navigation === null ? null : (
            <DocsSidebar
              activeSlug={slug ?? null}
              audience={audience}
              navigation={navigation}
              onNavigate={() => setSidebarOpen(false)}
              recentSlugs={recentSlugs}
            />
          )}
        </div>
      </aside>

      <section className="min-w-0 flex-1">
        <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <BookOpen size={13} strokeWidth={1.8} />
              {t("docs.title")}
            </p>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <DocsRoleFilter audience={audience} onChange={setAudience} />
            <Button onClick={printPage} size="sm" variant="secondary">
              <Printer size={14} strokeWidth={1.8} />
              {t("docs.print")}
            </Button>
          </div>
        </header>

        {contentLanguageNotice ? (
          <p className="mb-3 rounded-md border border-border bg-elevated px-3 py-2 text-[12px] text-muted-foreground">
            {t("docs.languageNotice")}
          </p>
        ) : null}

        <div className="print:hidden">
          <DocsSearch
            audience={audience}
            error={searchError}
            loading={searchLoading}
            onQueryChange={setQuery}
            query={query}
            response={searching ? response : null}
          />
        </div>

        {searching ? null : pageError !== null ? (
          pageError.status === 404 ? (
            <DocsEmptyState body={t("docs.notFoundBody")} kind="notFound" title={t("docs.notFoundTitle")} />
          ) : (
            <DocsEmptyState
              body={pageError.status === 503 ? t("docs.unavailableBody") : t(pageError.key)}
              kind={pageError.status === 503 ? "unavailable" : "empty"}
              title={pageError.status === 503 ? t("docs.unavailableTitle") : t("docs.errorTitle")}
            />
          )
        ) : pageLoading && page === null ? (
          <div className="mt-4">
            <PanelSkeleton label={t("docs.loading")} />
          </div>
        ) : page === null ? null : (
          <article className="mt-2">
            <DocsBreadcrumbs
              part={{ key: activePart?.key ?? page.part, label: activePart?.label ?? page.part }}
              title={page.title}
            />
            <div className="mb-4 flex flex-wrap items-center gap-2 text-[11.5px] text-muted-foreground">
              {page.module === "—" ? null : <Badge tone="neutral">{page.module}</Badge>}
              <span>{t("docs.updatedAt", { date: formattedDate })}</span>
              {matchesDocsAudience(page, audience) ? null : (
                <span className="text-warning">{t("docs.hiddenByFilter")}</span>
              )}
            </div>
            <MarkdownView headingIds={page.toc.map((heading) => heading.id)} source={page.markdown} />
            <DocsPager next={page.next} previous={page.previous} />
            <DocsFeedback slug={page.slug} />
          </article>
        )}
      </section>

      <aside className="hidden xl:block xl:w-52 xl:shrink-0 print:hidden">
        {searching || page === null ? null : <DocsToc toc={page.toc} />}
      </aside>
    </div>
  );
}
