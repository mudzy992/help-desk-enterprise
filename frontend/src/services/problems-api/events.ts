import { apiRequest } from "@/services/api";
import type { ProblemEvent } from "../problems-api";

export function getProblemEvents(
  id: string,
): Promise<{ readonly items: readonly ProblemEvent[]; readonly hasMore: boolean }> {
  return apiRequest(`/problems/${encodeURIComponent(id)}/events`);
}
