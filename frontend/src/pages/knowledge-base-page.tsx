import { ArrowDownUp, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CreateKnowledgeArticleForm } from "@/components/knowledge-base/create-knowledge-article-form";
import { KnowledgeArticleList } from "@/components/knowledge-base/knowledge-article-list";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { mapApiError, readApiRequestId, type ApiErrorKey } from "@/lib/map-api-error";
import { permissionKeys } from "@/lib/session/permission-keys";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";
import {
  listKnowledgeArticles,
  type KnowledgeArticleResponse,
} from "@/services/knowledge-base-api";

export function KnowledgeBasePage() {
  const { t } = useTranslation();
  const { hasPermission } = useSessionCapabilities();
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState<readonly KnowledgeArticleResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
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
      setItems(await listKnowledgeArticles());
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

  const visibleItems = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (needle.length === 0) {
      return items;
    }
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(needle) ||
        item.body.toLowerCase().includes(needle),
    );
  }, [items, search]);

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
      />
      {canWrite ? (
        <Card className="mb-4">
          <CardHeader title={t("knowledgeBase.createHeading")} />
          <div className="px-4 py-3.5">
            <CreateKnowledgeArticleForm onCreated={loadArticles} />
          </div>
        </Card>
      ) : null}
      <Card className="mb-4">
        <div className="flex items-center gap-3 px-4 py-3">
          <Search size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            className="h-8 flex-1 bg-transparent text-[14px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
            type="search"
            value={search}
            placeholder={t("knowledgeBase.searchWidePlaceholder")}
            aria-label={t("knowledgeBase.searchPlaceholder")}
            onChange={(event) => setSearch(event.target.value)}
          />
          <span className="hidden items-center gap-1.5 text-[11px] text-muted-foreground/70 md:flex">
            <ArrowDownUp size={12} aria-hidden="true" />
            {t("knowledgeBase.rankedByHelpfulness")}
          </span>
        </div>
      </Card>
      {isLoading ? (
        <PanelSkeleton className="mt-0" label={t("knowledgeBase.listHeading")} />
      ) : errorKey ? (
        <ApiErrorText messageKey={errorKey} requestId={requestId} />
      ) : (
        <KnowledgeArticleList
          items={visibleItems}
          canManageLifecycle={canManageLifecycle}
          onFeedback={loadArticles}
        />
      )}
    </section>
  );
}
