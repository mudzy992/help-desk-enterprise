import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CreateKnowledgeArticleForm } from "@/components/knowledge-base/create-knowledge-article-form";
import { KnowledgeArticleList } from "@/components/knowledge-base/knowledge-article-list";
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
    <section className="max-w-6xl">
      <h2 className="text-section font-medium text-foreground">
        {t("knowledgeBase.title")}
      </h2>
      <p className="mt-2 text-body text-muted-foreground">
        {t("knowledgeBase.intro")}
      </p>
      <h3 className="mt-6 text-body font-medium text-foreground">
        {t("knowledgeBase.createHeading")}
      </h3>
      <CreateKnowledgeArticleForm onCreated={loadArticles} />
      <h3 className="mt-8 text-body font-medium text-foreground">
        {t("knowledgeBase.listHeading")}
      </h3>
      {isLoading ? (
        <div className="mt-3 h-32 animate-pulse bg-elevated" />
      ) : errorKey ? (
        <p className="mt-3 text-body text-destructive">{t(errorKey)}</p>
      ) : (
        <KnowledgeArticleList items={items} onFeedback={loadArticles} />
      )}
    </section>
  );
}
