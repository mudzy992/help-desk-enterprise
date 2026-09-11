import type { KnowledgeInterceptSuggestion } from "@/services/knowledge-base-api";

export function canContinueAfterKnowledgeIntercept(
  articles: readonly KnowledgeInterceptSuggestion[],
): boolean {
  return articles.length >= 0;
}
