import { normalizeChangeReason } from "./normalize-change-reason";
import type { CatalogMutationContext } from "./service-catalog.types";

/**
 * Human catalog writes must provide their own reason. Internal/system writes
 * retain a stable action reason when no caller reason is supplied.
 */
export function normalizeCatalogMutationReason(input: {
  readonly reason: string | undefined;
  readonly context: CatalogMutationContext;
  readonly systemFallback: string;
}): string {
  return normalizeChangeReason({
    reason: input.reason,
    required: input.context.actorUserId !== null,
    fallback: input.systemFallback,
  });
}
