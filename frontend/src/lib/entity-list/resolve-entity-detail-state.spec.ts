import { describe, expect, it } from "vitest";
import { resolveEntityDetailState } from "@/lib/entity-list/resolve-entity-detail-state";
import { ApiError } from "@/services/api";

describe("resolveEntityDetailState", () => {
  it.each([
    [{ isLoading: true, hasData: false, error: null }, "loading"],
    [{ isLoading: false, hasData: false, error: null }, "not_found"],
    [
      { isLoading: false, hasData: false, error: new ApiError(404, "NOT_FOUND", "missing") },
      "not_found",
    ],
    [{ isLoading: false, hasData: false, error: new ApiError(503, "FAILED", "offline") }, "error"],
    [{ isLoading: false, hasData: true, error: new ApiError(503, "FAILED", "offline") }, "ready"],
    [{ isLoading: true, hasData: true, error: null }, "ready"],
  ] as const)("maps %o to %s", (input, expected) => {
    expect(resolveEntityDetailState(input)).toBe(expected);
  });
});
