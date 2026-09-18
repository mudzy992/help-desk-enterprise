import { describe, expect, it } from "vitest";
import { mapServiceCatalogError } from "@/lib/services/map-service-catalog-error";
import { ApiError } from "@/services/api";

describe("mapServiceCatalogError", () => {
  it("maps catalog mutation codes to localized keys", () => {
    expect(mapServiceCatalogError(new ApiError(409, "DUPLICATE_SLUG", "x"))).toBe(
      "services.errorDuplicateSlug",
    );
    expect(
      mapServiceCatalogError(new ApiError(400, "INVALID_LIFECYCLE_TRANSITION", "x")),
    ).toBe("services.errorLifecycle");
    expect(
      mapServiceCatalogError(new ApiError(400, "INVALID_LIFECYCLE_STATE", "x")),
    ).toBe("services.errorLifecycle");
    expect(mapServiceCatalogError(new ApiError(409, "NOT_DELETABLE", "x"))).toBe(
      "services.errorNotDeletable",
    );
    expect(mapServiceCatalogError(new ApiError(409, "HAS_DEPENDENCIES", "x"))).toBe(
      "services.errorHasDependencies",
    );
    expect(mapServiceCatalogError(new ApiError(404, "CATEGORY_NOT_FOUND", "x"))).toBe(
      "services.errorCategory",
    );
    expect(mapServiceCatalogError(new ApiError(400, "INVALID_NAME", "x"))).toBe(
      "services.errorValidation",
    );
    expect(mapServiceCatalogError(new ApiError(400, "INVALID_SLUG", "x"))).toBe(
      "services.errorValidation",
    );
    expect(
      mapServiceCatalogError(new ApiError(409, "OVERLAPPING_DOWNTIME_WINDOW", "x")),
    ).toBe("services.errorDowntimeOverlap");
    expect(mapServiceCatalogError(new ApiError(400, "INVALID_DOWNTIME_RANGE", "x"))).toBe(
      "services.errorDowntimeRange",
    );
  });

  it("maps auth, read-only, and unavailable statuses", () => {
    expect(mapServiceCatalogError(new ApiError(401, "INVALID_CREDENTIALS", "x"))).toBe(
      "services.errorUnauthorized",
    );
    expect(mapServiceCatalogError(new ApiError(403, "FORBIDDEN", "x"))).toBe(
      "services.errorForbidden",
    );
    expect(mapServiceCatalogError(new ApiError(403, "READ_ONLY_MODE", "x"))).toBe(
      "services.errorReadOnly",
    );
    expect(
      mapServiceCatalogError(new ApiError(503, "LIFECYCLE_UNAVAILABLE", "x")),
    ).toBe("services.errorUnavailable");
  });

  it("falls back by HTTP status when the code is unknown", () => {
    expect(mapServiceCatalogError(new ApiError(409, "CONFLICT", "x"))).toBe(
      "services.errorDuplicateSlug",
    );
    expect(mapServiceCatalogError(new ApiError(422, "VALIDATION", "x"))).toBe(
      "services.errorValidation",
    );
    expect(mapServiceCatalogError(new Error("offline"))).toBe("services.errorGeneric");
  });
});
