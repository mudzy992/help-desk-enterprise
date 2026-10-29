import { reportClientError } from "@/lib/app/client-logger";
import {
  interceptKnowledgeArticles,
  type KnowledgeInterceptSuggestion,
} from "@/services/knowledge-base-api";

export type KnowledgeInterceptStep =
  | { readonly kind: "suggestions"; readonly articles: readonly KnowledgeInterceptSuggestion[] }
  /** Baza znanja nije odgovorila; wizard nastavlja bez prijedloga. */
  | { readonly kind: "unavailable" };

/**
 * Traži članke koji bi mogli riješiti zahtjev bez otvaranja tiketa.
 * Prijedlozi nisu uslov: ako baza znanja ne odgovori, wizard nastavlja, a
 * greška se bilježi radi dijagnostike.
 */
export async function fetchKnowledgeInterceptStep(input: {
  readonly serviceId: string;
  readonly query: string;
}): Promise<KnowledgeInterceptStep> {
  try {
    const result = await interceptKnowledgeArticles({
      serviceId: input.serviceId,
      query: input.query,
    });
    return { kind: "suggestions", articles: result.articles };
  } catch (error) {
    reportClientError("knowledge_intercept_failed", error);
    return { kind: "unavailable" };
  }
}
