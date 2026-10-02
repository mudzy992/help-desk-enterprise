import { useCallback, useEffect, useMemo, useState } from "react";
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
  const { isSuperAdmin, canWrite, canManageLifecycle } =
    resolveKnowledgeCapabilities(capabilities);
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
  const [status, setStatus] = useState<KnowledgeArticleStatus | "">("");
  const [serviceId, setServiceId] = useState("");
  const [staleOnly, setStaleOnly] = useState(false);
  const [createPrefillTitle, setCreatePrefillTitle] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [errorKey, setErrorKey] = useState<ApiErrorKey | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);

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
    setIsLoading(true);
    setErrorKey(null);
    setRequestId(null);
    try {
      const [articles, catalog] = await Promise.all([
        listKnowledgeArticles({
          q: debouncedSearch.trim() || undefined,
          status: status === "" ? undefined : status,
          serviceId: serviceId || undefined,
          staleOnly: staleOnly || undefined,
        }),
        listServices().catch(() => []),
      ]);
      setItems(articles);
      setServices(catalog);
    } catch (error) {
      setItems([]);
      setErrorKey(mapApiError(error));
      setRequestId(readApiRequestId(error));
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearch, serviceId, staleOnly, status]);

  useEffect(() => {
    void loadArticles();
  }, [loadArticles]);

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
  const originUnits = useMemo(
    () => flattenOriginUnitOptions(directory.tree),
    [directory.tree],
  );
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
          ...(canSeeInsights ? [{ key: "insights", label: t("knowledgeBase.portal.tabInsights") }] : []),
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
        onStatusChange={setStatus}
        onServiceIdChange={setServiceId}
        onStaleOnlyChange={setStaleOnly}
      />
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
            onClearFilters={() => {
              setSearch("");
              setStatus("");
              setServiceId("");
              setStaleOnly(false);
            }}
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
