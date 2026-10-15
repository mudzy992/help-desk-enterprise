export type EntityListState = "loading" | "error" | "empty" | "ready";

export function resolveEntityListState(input: {
  readonly isLoading: boolean;
  readonly hasError: boolean;
  readonly itemCount: number;
}): EntityListState {
  if (input.isLoading) return "loading";
  if (input.hasError) return "error";
  return input.itemCount === 0 ? "empty" : "ready";
}
