import { describe, expect, it } from "vitest";
import { mapRoutingError } from "@/lib/routing/map-routing-error";
import { ApiError } from "@/services/api";

describe("mapRoutingError", () => {
  it("maps duplicate, reason, unauthorized, and forbidden codes", () => {
    expect(mapRoutingError(new ApiError(409, "DUPLICATE_RULE", "x"))).toBe(
      "routing.errorDuplicate",
    );
    expect(mapRoutingError(new ApiError(400, "REASON_REQUIRED", "x"))).toBe(
      "routing.errorReason",
    );
    expect(mapRoutingError(new ApiError(401, "INVALID_CREDENTIALS", "x"))).toBe(
      "routing.errorUnauthorized",
    );
    expect(mapRoutingError(new ApiError(403, "FORBIDDEN", "x"))).toBe(
      "routing.errorForbidden",
    );
    expect(mapRoutingError(new ApiError(404, "ORIGIN_UNIT_NOT_FOUND", "x"))).toBe(
      "routing.errorGeneric",
    );
  });
});
