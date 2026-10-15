import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CreateKnowledgeArticleSheet } from "@/components/knowledge-base/create-knowledge-article-sheet";
import { KnowledgeArticleList } from "@/components/knowledge-base/knowledge-article-list";
import { KnowledgeArticleSearchCard } from "@/components/knowledge-base/knowledge-article-search-card";
import { KnowledgeInsightsPanel } from "@/components/knowledge-base/portal/knowledge-insights-panel";
import { KnowledgePortalHome } from "@/components/knowledge-base/portal/knowledge-portal-home";
import { UnderlineTabs } from "@/components/ui/tabs";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Button } from "@/components/ui/button";
import { PageHeader, brandCrumb } from "@/components/ui/page-header";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { useDirectory } from "@/lib/directory/use-directory";
import { createLatestRequestGuard } from "@/lib/async/latest-request-guard";
import { knowledgeListFiltersAreActive } from "@/lib/knowledge-base/filter-knowledge-articles";
import { mapApiError, readApiRequestId, type ApiErrorKey } from "@/lib/map-api-error";
import { resolveKnowledgeCapabilities } from "@/lib/knowledge-base/knowledge-capabilities";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";
import { flattenOriginUnitOptions } from "@/lib/tickets/ticket-display";
import {
  listKnowledgeArticles,
  type KnowledgeArticleResponse,
  type KnowledgeArticleStatus,
} from "@/services/knowledge-base-api";
import { listServices, type ServiceResponse } from "@/services/service-catalog-api";

const searchDebounceMs = 300;

export function KnowledgeBasePage() {
  const { t } = useTranslation();
  const directory = useDirectory();
  const capabilities = useSessionCapabilities();
  const { isSuperAdmin, canWrite, canManageLifecycle } = resolveKnowledgeCapabilities(capabilities);
  const [searchParams, setSearchParams] = useSearchParams();
  // Paket 2.9 (K1): portal (default) | all articles | insights (curators).
  const canSeeInsights = canWrite || canManageLifecycle;
  const requestedView = searchParams.get("view");
  const view =
    requestedView === "articles" || searchParams.has("q")
      ? "articles"
      : requestedView === "insights" && canSeeInsights
        ? "insights"
        : "portal";
  const setView = (next: string) => {
    const params = new URLSearchParams(searchParams);
    params.delete("q");
    if (next === "portal") params.delete("view");
    else params.set("view", next);
    setSearchParams(params, { replace: true });
  };
  const [items, setItems] = useState<readonly KnowledgeArticleResponse[]>([]);
  const [services, setServices] = useState<readonly ServiceResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const status = (searchParams.get("status") ?? "") as KnowledgeArticleStatus | "";
  const serviceId = searchParams.get("service") ?? "";
  const staleOnly = searchParams.get("stale") === "true";
  const [createPrefillTitle, setCreatePrefillTitle] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [errorKey, setErrorKey] = useState<ApiErrorKey | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [servicesErrorKey, setServicesErrorKey] = useState<ApiErrorKey | null>(null);
  const loadGuard = useRef(createLatestRequestGuard());

  useEffect(() => {
    setSearch(searchParams.get("q") ?? "");
  }, [searchParams]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search);
    }, searchDebounceMs);
    return () => window.clearTimeout(timer);
  }, [search]);

  const loadArticles = useCallback(async () => {
    const request = loadGuard.current.begin();
    setIsLoading(true);
    setErrorKey(null);
    setRequestId(null);
    const filters = {
      q: debouncedSearch.trim() || undefined,
      status: status === "" ? undefined : status,
      serviceId: serviceId || undefined,
      staleOnly: staleOnly || undefined,
    };
    const [articlesResult, servicesResult] = await Promise.allSettled([
      listKnowledgeArticles(filters),
      listServices(),
    ]);
    if (!loadGuard.current.isCurrent(request)) return;
    if (articlesResult.status === "fulfilled") setItems(articlesResult.value);
    else {
      setErrorKey(mapApiError(articlesResult.reason));
      setRequestId(readApiRequestId(articlesResult.reason));
    }
    if (servicesResult.status === "fulfilled") {
      setServices(servicesResult.value);
      setServicesErrorKey(null);
    } else setServicesErrorKey(mapApiError(servicesResult.reason));
    setIsLoading(false);
  }, [debouncedSearch, serviceId, staleOnly, status]);

  useEffect(() => {
    const guard = loadGuard.current;
    void loadArticles();
    return () => guard.cancel();
  }, [loadArticles]);

  const setListParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === "") next.delete(key);
    else next.set(key, value);
    next.set("view", "articles");
    setSearchParams(next, { replace: true });
  };

  const clearListFilters = () => {
    const next = new URLSearchParams(searchParams);
    for (const key of ["q", "status", "service", "stale"]) next.delete(key);
    next.set("view", "articles");
    setSearchParams(next, { replace: true });
    setSearch("");
  };

  const filtersActive = knowledgeListFiltersAreActive({
    search: debouncedSearch,
    status,
    serviceId,
    staleOnly,
  });
  const ownerNames = useMemo(
    () => new Map(directory.users.map((user) => [user.id, user.displayName])),
    [directory.users],
  );
  const originUnits = useMemo(() => flattenOriginUnitOptions(directory.tree), [directory.tree]);
  const serviceNames = useMemo(
    () => new Map(services.map((service) => [service.id, service.name])),
    [services],
  );
  const reviewDueCount = items.filter((item) => item.status === "IN_REVIEW").length;
  const staleCount = items.filter((item) => item.isStale).length;
  const subtitle =
    reviewDueCount > 0 || staleCount > 0
      ? t("knowledgeBase.introWithCounts", {
          reviewDue: reviewDueCount,
          stale: staleCount,
        })
      : t("knowledgeBase.intro");

  return (
    <section>
      <PageHeader
        crumbs={[brandCrumb, t("navigation.sections.services"), t("knowledgeBase.title")]}
        title={t("knowledgeBase.title")}
        subtitle={subtitle}
        actions={
          canWrite ? (
            <Button
              type="button"
              size="sm"
              variant="primary"
              onClick={() => {
                setCreatePrefillTitle("");
                setIsCreateOpen(true);
              }}
            >
              <Plus size={14} /> {t("knowledgeBase.createAction")}
            </Button>
          ) : null
        }
      />
      <CreateKnowledgeArticleSheet
        open={isCreateOpen}
        services={services}
        originUnits={originUnits}
        users={directory.users}
        isSuperAdmin={isSuperAdmin}
        initialTitle={createPrefillTitle}
        onOpenChange={(open) => {
          setIsCreateOpen(open);
          if (!open) {
            setCreatePrefillTitle("");
          }
        }}
        onCreated={loadArticles}
      />
      <UnderlineTabs
        className="mb-4"
        active={view}
        onChange={setView}
        items={[
          { key: "portal", label: t("knowledgeBase.portal.tabPortal") },
          { key: "articles", label: t("knowledgeBase.portal.tabArticles") },
          ...(canSeeInsights
            ? [{ key: "insights", label: t("knowledgeBase.portal.tabInsights") }]
            : []),
        ]}
      />
      {view === "portal" ? <KnowledgePortalHome /> : null}
      {view === "insights" ? <KnowledgeInsightsPanel /> : null}
      {view === "articles" ? (
        <>
          <KnowledgeArticleSearchCard
            search={search}
            status={status}
            serviceId={serviceId}
            staleOnly={staleOnly}
            services={services}
            onSearchChange={setSearch}
            onStatusChange={(value) => setListParam("status", value)}
            onServiceIdChange={(value) => setListParam("service", value)}
            onStaleOnlyChange={(value) => setListParam("stale", value ? "true" : "")}
          />
          {servicesErrorKey ? <ApiErrorText messageKey={servicesErrorKey} /> : null}
          {directory.partialFailure ? (
            <p role="status" className="text-[12px] text-warning">
              {t("directory.partialFailure")}
            </p>
          ) : null}
          {isLoading ? (
            <PanelSkeleton className="mt-0" label={t("knowledgeBase.listHeading")} />
          ) : errorKey ? (
            <ApiErrorText messageKey={errorKey} requestId={requestId} />
          ) : (
            <>
              <KnowledgeArticleList
                items={items}
                canManageLifecycle={canManageLifecycle}
                isFiltered={filtersActive}
                searchQuery={debouncedSearch}
                ownerNames={ownerNames}
                serviceNames={serviceNames}
                canWrite={canWrite}
                onCreate={() => {
                  setCreatePrefillTitle("");
                  setIsCreateOpen(true);
                }}
                onCreateForQuery={() => {
                  setCreatePrefillTitle(debouncedSearch.trim());
                  setIsCreateOpen(true);
                }}
                onClearFilters={clearListFilters}
                onFeedback={loadArticles}
              />
              <p className="mt-4 text-[11.5px] leading-5 text-muted-foreground">
                {t("knowledgeBase.interceptRankingHint")}
              </p>
            </>
          )}
        </>
      ) : null}
    </section>
  );
}
