import { ApiError } from "@/services/api";

export type EntityDetailState = "loading" | "not_found" | "error" | "ready";

/** Keeps a successful detail snapshot visible when a background refresh fails. */
export function resolveEntityDetailState(input: {
  readonly isLoading: boolean;
  readonly hasData: boolean;
  readonly error: unknown;
}): EntityDetailState {
  if (input.hasData) return "ready";
  if (input.isLoading) return "loading";
  if (input.error instanceof ApiError && input.error.status === 404) return "not_found";
  return input.error === null ? "not_found" : "error";
}
