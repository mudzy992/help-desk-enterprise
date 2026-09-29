import { ChevronDown, ChevronLeft, Eye, FolderOpen, Settings2, Star } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { KnowledgeCategoriesManager } from "@/components/knowledge-base/portal/knowledge-categories-manager";
import { KnowledgeCategoryIcon } from "@/components/knowledge-base/portal/knowledge-category-icon";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PanelSkeleton } from "@/components/ui/skeleton";
import {
  buildKnowledgeCategoryTree,
  formatAverageRating,
  knowledgeCategoryName,
} from "@/lib/knowledge-base/knowledge-portal";
import { mapApiError, readApiRequestId, type ApiErrorKey } from "@/lib/map-api-error";
import {
  getKnowledgePortalHome,
  listKnowledgeCategoryArticles,
  type KnowledgePortalArticle,
  type KnowledgePortalHome,
} from "@/services/knowledge-portal-api";

const uncategorized = "uncategorized";

/**
 * Paket 2.9 (K1a): portal home — FAQ accordion on top, category grid below;
 * a category opens its published articles (a root includes its children).
 */
export function KnowledgePortalHome() {
  const { t, i18n } = useTranslation();
  const [home, setHome] = useState<KnowledgePortalHome | null>(null);
  const [errorKey, setErrorKey] = useState<ApiErrorKey | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [articles, setArticles] = useState<readonly KnowledgePortalArticle[] | null>(null);
  const [isManagerOpen, setIsManagerOpen] = useState(false);

  const load = useCallback(async () => {
    setErrorKey(null);
    try {
      setHome(await getKnowledgePortalHome());
    } catch (error) {
      setErrorKey(mapApiError(error));
      setRequestId(readApiRequestId(error));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (selected === null) {
      setArticles(null);
      return;
    }
    let cancelled = false;
    setArticles(null);
    listKnowledgeCategoryArticles(selected)
      .then((loaded) => {
        if (!cancelled) setArticles(loaded);
      })
      .catch(() => {
        if (!cancelled) setArticles([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const tree = useMemo(() => buildKnowledgeCategoryTree(home?.categories ?? []), [home]);

  if (errorKey !== null) {
    return <ApiErrorText messageKey={errorKey} requestId={requestId} />;
  }
  if (home === null) {
    return <PanelSkeleton className="mt-0" label={t("knowledgeBase.portal.title")} />;
  }

  const selectedCategory = home.categories.find((category) => category.id === selected) ?? null;
  const selectedName =
    selected === uncategorized
      ? t("knowledgeBase.portal.uncategorized")
      : selectedCategory === null
        ? ""
        : knowledgeCategoryName(selectedCategory, i18n.language);

  return (
    <div className="grid gap-4" data-testid="knowledge-portal">
      {home.capabilities.canManageCategories ? (
        <div className="flex justify-end">
          <Button type="button" size="sm" variant="outline" onClick={() => setIsManagerOpen(true)}>
            <Settings2 size={14} aria-hidden="true" /> {t("knowledgeBase.portal.manageCategories")}
          </Button>
          <KnowledgeCategoriesManager
            open={isManagerOpen}
            onOpenChange={setIsManagerOpen}
            onChanged={load}
          />
        </div>
      ) : null}

      {selected !== null ? (
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(null)}>
              <ChevronLeft size={14} aria-hidden="true" /> {t("knowledgeBase.portal.backToPortal")}
            </Button>
            <h2 className="text-[14px] font-semibold text-foreground">{selectedName}</h2>
          </div>
          {articles === null ? (
            <PanelSkeleton className="mt-3" label={selectedName} />
          ) : articles.length === 0 ? (
            <EmptyState
              icon={<FolderOpen size={18} />}
              title={t("knowledgeBase.portal.categoryEmpty")}
            />
          ) : (
            <ul className="mt-3 grid gap-2">
              {articles.map((article) => (
                <PortalArticleRow key={article.id} article={article} />
              ))}
            </ul>
          )}
        </Card>
      ) : (
        <>
          {home.faq.length > 0 ? (
            <section aria-labelledby="kb-faq-heading">
              <h2 id="kb-faq-heading" className="mb-2 text-[13px] font-semibold text-foreground">
                {t("knowledgeBase.portal.faqTitle")}
              </h2>
              <Card className="divide-y divide-border/70">
                {home.faq.map((item) => (
                  <details key={item.id} className="group px-4 py-2.5" data-testid="knowledge-faq-item">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-md text-[13px] font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/70 [&::-webkit-details-marker]:hidden">
                      <span>{item.title}</span>
                      <ChevronDown
                        size={14}
                        aria-hidden="true"
                        className="shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                      />
                    </summary>
                    <p className="mt-2 whitespace-pre-wrap text-[12.5px] leading-relaxed text-muted-foreground">
                      {item.body.length > 1200 ? `${item.body.slice(0, 1200)}…` : item.body}
                    </p>
                    <Link
                      to={`/knowledge-base/${item.id}`}
                      className="mt-2 inline-block text-[12px] font-medium text-link hover:underline"
                    >
                      {t("knowledgeBase.portal.openArticle")}
                    </Link>
                  </details>
                ))}
              </Card>
            </section>
          ) : null}

          <section aria-labelledby="kb-categories-heading">
            <h2 id="kb-categories-heading" className="mb-2 text-[13px] font-semibold text-foreground">
              {t("knowledgeBase.portal.categoriesTitle")}
            </h2>
            {tree.length === 0 && home.uncategorizedCount === 0 ? (
              <EmptyState icon={<FolderOpen size={18} />} title={t("knowledgeBase.portal.empty")} />
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {tree.map((node) => (
                  <li key={node.id}>
                    <Card className="h-full p-4">
                      <button
                        type="button"
                        className="flex w-full items-start gap-3 rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/70"
                        onClick={() => setSelected(node.id)}
                      >
                        <span className="mt-0.5 rounded-md border border-primary/25 bg-primary/10 p-2 text-link">
                          <KnowledgeCategoryIcon name={node.icon} />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[13.5px] font-semibold text-foreground">
                            {knowledgeCategoryName(node, i18n.language)}
                          </span>
                          <span className="tnum block text-[11.5px] text-muted-foreground">
                            {t("knowledgeBase.portal.articleCount", { count: node.articleCount })}
                          </span>
                        </span>
                      </button>
                      {node.children.length > 0 ? (
                        <ul className="mt-3 flex flex-wrap gap-1.5">
                          {node.children.map((child) => (
                            <li key={child.id}>
                              <button
                                type="button"
                                onClick={() => setSelected(child.id)}
                                className="rounded-full border border-border px-2 py-0.5 text-[11.5px] text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/70"
                              >
                                {knowledgeCategoryName(child, i18n.language)}{" "}
                                <span className="tnum">({child.articleCount})</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </Card>
                  </li>
                ))}
                {home.uncategorizedCount > 0 ? (
                  <li>
                    <Card className="h-full p-4">
                      <button
                        type="button"
                        className="flex w-full items-start gap-3 rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/70"
                        onClick={() => setSelected(uncategorized)}
                      >
                        <span className="mt-0.5 rounded-md border border-border bg-elevated/60 p-2 text-muted-foreground">
                          <FolderOpen size={18} strokeWidth={1.8} aria-hidden="true" />
                        </span>
                        <span>
                          <span className="block text-[13.5px] font-semibold text-foreground">
                            {t("knowledgeBase.portal.uncategorized")}
                          </span>
                          <span className="tnum block text-[11.5px] text-muted-foreground">
                            {t("knowledgeBase.portal.articleCount", { count: home.uncategorizedCount })}
                          </span>
                        </span>
                      </button>
                    </Card>
                  </li>
                ) : null}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export function PortalArticleRow({ article }: { readonly article: KnowledgePortalArticle }) {
  const { t, i18n } = useTranslation();
  const average = formatAverageRating(article.averageRating, i18n.language);
  return (
    <li className="rounded-md border border-border/70 px-3.5 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <Link
          to={`/knowledge-base/${article.id}`}
          className="text-[13px] font-medium text-foreground hover:text-link hover:underline"
        >
          {article.title}
        </Link>
        <span className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
          {article.isStale ? <Badge tone="warning">{t("knowledgeBase.stale")}</Badge> : null}
          {average !== null ? (
            <span className="tnum flex items-center gap-0.5">
              <Star size={11} aria-hidden="true" className="fill-warning text-warning" />
              <span aria-hidden="true">{average}</span>
              <span className="sr-only">{t("knowledgeBase.portal.rating.summary", { average, count: article.ratingCount })}</span>
            </span>
          ) : null}
          <span className="tnum flex items-center gap-0.5">
            <Eye size={11} aria-hidden="true" />
            <span aria-hidden="true">{article.viewCount}</span>
            <span className="sr-only">{t("knowledgeBase.portal.views", { count: article.viewCount })}</span>
          </span>
        </span>
      </div>
      {article.bodyPreview.length > 0 ? (
        <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-muted-foreground">{article.bodyPreview}</p>
      ) : null}
    </li>
  );
}
