import { describe, expect, it } from "vitest";
import { resolveEntityListState } from "@/lib/entity-list/resolve-entity-list-state";

describe("resolveEntityListState", () => {
  it("does not expose empty state together with an error", () => {
    expect(resolveEntityListState({ isLoading: false, hasError: true, itemCount: 0 })).toBe(
      "error",
    );
  });

  it.each([
    [{ isLoading: true, hasError: false, itemCount: 0 }, "loading"],
    [{ isLoading: false, hasError: false, itemCount: 0 }, "empty"],
    [{ isLoading: false, hasError: false, itemCount: 1 }, "ready"],
    [{ isLoading: false, hasError: true, itemCount: 2 }, "ready"],
    [{ isLoading: true, hasError: false, itemCount: 2 }, "ready"],
  ] as const)("maps %o to %s", (input, expected) => {
    expect(resolveEntityListState(input)).toBe(expected);
  });
});
