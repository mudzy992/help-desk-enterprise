import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CreateKnowledgeArticleForm } from "@/components/knowledge-base/create-knowledge-article-form";
import { KnowledgeArticleList } from "@/components/knowledge-base/knowledge-article-list";
import { Card, CardHeader } from "@/components/ui/card";
import { errorTextClassName } from "@/components/ui/control";
import { PageHeader } from "@/components/ui/page-header";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/services/api";
import {
  listKnowledgeArticles,
  type KnowledgeArticleResponse,
} from "@/services/knowledge-base-api";

export function KnowledgeBasePage() {
  const { t } = useTranslation();
  const [items, setItems] = useState<readonly KnowledgeArticleResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<
    "knowledgeBase.errorUnauthorized" | "knowledgeBase.errorGeneric" | null
  >(null);

  const loadArticles = useCallback(async () => {
    setIsLoading(true);
    setErrorKey(null);
    try {
      setItems(await listKnowledgeArticles());
    } catch (error) {
      setItems([]);
      setErrorKey(
        error instanceof ApiError && error.status === 401
          ? "knowledgeBase.errorUnauthorized"
          : "knowledgeBase.errorGeneric",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadArticles();
  }, [loadArticles]);

  return (
    <section>
      <PageHeader
        crumbs={["EP-HelpDesk", t("knowledgeBase.title")]}
        title={t("knowledgeBase.title")}
        subtitle={t("knowledgeBase.intro")}
      />
      <Card className="mb-4">
        <CardHeader title={t("knowledgeBase.createHeading")} />
        <div className="px-4 py-3.5">
          <CreateKnowledgeArticleForm onCreated={loadArticles} />
        </div>
      </Card>
      <Card>
        <CardHeader title={t("knowledgeBase.listHeading")} />
        <div className="px-4 py-3.5">
          {isLoading ? (
            <PanelSkeleton className="mt-0" label={t("knowledgeBase.listHeading")} />
          ) : errorKey ? (
            <p className={errorTextClassName}>{t(errorKey)}</p>
          ) : (
            <KnowledgeArticleList items={items} onFeedback={loadArticles} />
          )}
        </div>
      </Card>
    </section>
  );
}
