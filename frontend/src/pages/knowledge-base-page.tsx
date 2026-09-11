import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CreateKnowledgeArticleForm } from "@/components/knowledge-base/create-knowledge-article-form";
import { KnowledgeArticleList } from "@/components/knowledge-base/knowledge-article-list";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Card, CardHeader } from "@/components/ui/card";
import { controlClassName } from "@/components/ui/control";
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
  const [items, setItems] = useState<readonly KnowledgeArticleResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [errorKey, setErrorKey] = useState<ApiErrorKey | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);

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
        crumbs={["EP-HelpDesk", t("knowledgeBase.title")]}
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
      <Card>
        <CardHeader
          title={t("knowledgeBase.listHeading")}
          actions={
            <input
              className={`${controlClassName} w-full sm:w-64`}
              type="search"
              value={search}
              placeholder={t("knowledgeBase.searchPlaceholder")}
              aria-label={t("knowledgeBase.searchPlaceholder")}
              onChange={(event) => setSearch(event.target.value)}
            />
          }
        />
        <div className="px-4 py-3.5">
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
        </div>
      </Card>
    </section>
  );
}
