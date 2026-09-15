import { describe, expect, it } from "vitest";
import { mapServiceCategoryError } from "@/lib/services/map-service-category-error";
import { ApiError } from "@/services/api";

describe("mapServiceCategoryError", () => {
  it("maps category mutation codes", () => {
    expect(mapServiceCategoryError(new ApiError(404, "CATEGORY_NOT_FOUND", "x"))).toBe(
      "services.categories.errorNotFound",
    );
    expect(mapServiceCategoryError(new ApiError(409, "DUPLICATE_SLUG", "x"))).toBe(
      "services.categories.errorDuplicateSlug",
    );
    expect(mapServiceCategoryError(new ApiError(409, "CATEGORY_HAS_CHILDREN", "x"))).toBe(
      "services.categories.errorHasChildren",
    );
    expect(mapServiceCategoryError(new ApiError(409, "CATEGORY_HAS_SERVICES", "x"))).toBe(
      "services.categories.errorHasServices",
    );
    expect(mapServiceCategoryError(new ApiError(400, "CIRCULAR_CATEGORY", "x"))).toBe(
      "services.categories.errorCircular",
    );
  });
});
