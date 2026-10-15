import { useCallback, useEffect, useRef, useState } from "react";
import { createLatestRequestGuard } from "@/lib/async/latest-request-guard";
import { readApiRequestId } from "@/lib/map-api-error";
import {
  mapKnowledgeArticleError,
  type KnowledgeArticleErrorKey,
} from "@/lib/knowledge-base/map-knowledge-article-error";
import { getKnowledgeArticle, type KnowledgeArticleResponse } from "@/services/knowledge-base-api";

export type KnowledgeArticleDetailState = {
  readonly article: KnowledgeArticleResponse | null;
  readonly isLoading: boolean;
  readonly isRefreshing: boolean;
  readonly errorKey: KnowledgeArticleErrorKey | null;
  readonly requestId: string | null;
  readonly reload: () => Promise<void>;
};

export function useKnowledgeArticle(articleId: string | undefined): KnowledgeArticleDetailState {
  const [article, setArticle] = useState<KnowledgeArticleResponse | null>(null);
  const articleRef = useRef(article);
  articleRef.current = article;
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorKey, setErrorKey] = useState<KnowledgeArticleErrorKey | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const guardRef = useRef(createLatestRequestGuard());

  const reload = useCallback(async () => {
    const request = guardRef.current.begin();
    if (!articleId) {
      setArticle(null);
      setErrorKey("knowledgeBase.errorNotFound");
      setRequestId(null);
      setIsLoading(false);
      return;
    }
    const initial = articleRef.current === null;
    setIsLoading(initial);
    setIsRefreshing(!initial);
    setErrorKey(null);
    setRequestId(null);
    try {
      const loaded = await getKnowledgeArticle(articleId);
      if (guardRef.current.isCurrent(request)) setArticle(loaded);
    } catch (error) {
      if (!guardRef.current.isCurrent(request)) return;
      if (initial) setArticle(null);
      setErrorKey(mapKnowledgeArticleError(error));
      setRequestId(readApiRequestId(error));
    } finally {
      if (guardRef.current.isCurrent(request)) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [articleId]);

  useEffect(() => {
    const guard = guardRef.current;
    articleRef.current = null;
    setArticle(null);
    void reload();
    return () => guard.cancel();
  }, [reload]);

  return { article, isLoading, isRefreshing, errorKey, requestId, reload };
}
