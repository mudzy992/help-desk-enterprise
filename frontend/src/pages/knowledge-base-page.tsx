import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CreateKnowledgeArticleSheet } from "@/components/knowledge-base/create-knowledge-article-sheet";
import { KnowledgeArticleList } from "@/components/knowledge-base/knowledge-article-list";
import { KnowledgeArticleSearchCard } from "@/components/knowledge-base/knowledge-article-search-card";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { useDirectory } from "@/lib/directory/use-directory";
import {
  filterKnowledgeArticles,
  knowledgeListFiltersAreActive,
  type KnowledgeListFilters,
} from "@/lib/knowledge-base/filter-knowledge-articles";
import { mapApiError, readApiRequestId, type ApiErrorKey } from "@/lib/map-api-error";
import { permissionKeys } from "@/lib/session/permission-keys";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";
import { flattenOriginUnitOptions } from "@/lib/tickets/ticket-display";
import {
  listKnowledgeArticles,
  type KnowledgeArticleResponse,
  type KnowledgeArticleStatus,
} from "@/services/knowledge-base-api";
import { listServices, type ServiceResponse } from "@/services/service-catalog-api";

export function KnowledgeBasePage() {
  const { t } = useTranslation();
  const directory = useDirectory();
  const { hasPermission } = useSessionCapabilities();
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState<readonly KnowledgeArticleResponse[]>([]);
  const [services, setServices] = useState<readonly ServiceResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [status, setStatus] = useState<KnowledgeArticleStatus | "">("");
  const [serviceId, setServiceId] = useState("");
  const [staleOnly, setStaleOnly] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [errorKey, setErrorKey] = useState<ApiErrorKey | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);

  useEffect(() => {
    setSearch(searchParams.get("q") ?? "");
  }, [searchParams]);

  const loadArticles = useCallback(async () => {
    setIsLoading(true);
    setErrorKey(null);
    setRequestId(null);
    try {
      const [articles, catalog] = await Promise.all([
        listKnowledgeArticles(),
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
  }, []);

  useEffect(() => {
    void loadArticles();
  }, [loadArticles]);

  const filters: KnowledgeListFilters = useMemo(
    () => ({ search, status, serviceId, staleOnly }),
    [search, serviceId, staleOnly, status],
  );
  const visibleItems = useMemo(
    () => filterKnowledgeArticles(items, filters),
    [filters, items],
  );
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
  const canWrite = hasPermission(permissionKeys.knowledgeArticleWrite);
  const canManageLifecycle =
    hasPermission(permissionKeys.knowledgeArticleReview) ||
    hasPermission(permissionKeys.knowledgeArticlePublish);

  return (
    <section>
      <PageHeader
        crumbs={["EP-HelpDesk", t("navigation.sections.services"), t("knowledgeBase.title")]}
        title={t("knowledgeBase.title")}
        subtitle={t("knowledgeBase.intro")}
        actions={
          canWrite ? (
            <Button
              type="button"
              size="sm"
              variant="primary"
              onClick={() => setIsCreateOpen(true)}
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
        onOpenChange={setIsCreateOpen}
        onCreated={loadArticles}
      />
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
            items={visibleItems}
            canManageLifecycle={canManageLifecycle}
            isFiltered={knowledgeListFiltersAreActive(filters)}
            ownerNames={ownerNames}
            serviceNames={serviceNames}
            onFeedback={loadArticles}
          />
          <p className="mt-4 text-[11.5px] leading-5 text-muted-foreground/70">
            {t("knowledgeBase.interceptRankingHint")}
          </p>
        </>
      )}
    </section>
  );
}
