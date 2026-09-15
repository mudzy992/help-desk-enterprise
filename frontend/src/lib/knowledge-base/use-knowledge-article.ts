import { useCallback, useEffect, useState } from "react";
import { readApiRequestId } from "@/lib/map-api-error";
import {
  mapKnowledgeArticleError,
  type KnowledgeArticleErrorKey,
} from "@/lib/knowledge-base/map-knowledge-article-error";
import {
  getKnowledgeArticle,
  type KnowledgeArticleResponse,
} from "@/services/knowledge-base-api";

export type KnowledgeArticleDetailState = {
  readonly article: KnowledgeArticleResponse | null;
  readonly isLoading: boolean;
  readonly errorKey: KnowledgeArticleErrorKey | null;
  readonly requestId: string | null;
  readonly reload: () => Promise<void>;
};

export function useKnowledgeArticle(
  articleId: string | undefined,
): KnowledgeArticleDetailState {
  const [article, setArticle] = useState<KnowledgeArticleResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<KnowledgeArticleErrorKey | null>(
    null,
  );
  const [requestId, setRequestId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (articleId === undefined || articleId.length === 0) {
      setArticle(null);
      setErrorKey("knowledgeBase.errorNotFound");
      setRequestId(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setErrorKey(null);
    setRequestId(null);
    try {
      setArticle(await getKnowledgeArticle(articleId));
    } catch (error) {
      setArticle(null);
      setErrorKey(mapKnowledgeArticleError(error));
      setRequestId(readApiRequestId(error));
    } finally {
      setIsLoading(false);
    }
  }, [articleId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { article, isLoading, errorKey, requestId, reload };
}
