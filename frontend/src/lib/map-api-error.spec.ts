import { describe, expect, it } from "vitest";
import { mapApiError, readApiRequestId } from "@/lib/map-api-error";
import { ApiError } from "@/services/api";

describe("mapApiError", () => {
  it("maps the HTTP statuses the API can return to localized keys", () => {
    expect(mapApiError(new ApiError(401, "INVALID_CREDENTIALS", ""))).toBe(
      "errors.unauthorized",
    );
    expect(mapApiError(new ApiError(403, "FORBIDDEN", ""))).toBe(
      "errors.forbidden",
    );
    expect(mapApiError(new ApiError(404, "NOT_FOUND", ""))).toBe(
      "errors.notFound",
    );
    expect(mapApiError(new ApiError(409, "CONFLICT", ""))).toBe(
      "errors.conflict",
    );
    expect(mapApiError(new ApiError(422, "VALIDATION", ""))).toBe(
      "errors.validation",
    );
    expect(mapApiError(new ApiError(500, "INTERNAL", ""))).toBe("errors.server");
  });

  it("prefers the backend error code over the status", () => {
    expect(mapApiError(new ApiError(503, "SETUP_REQUIRED", ""))).toBe(
      "errors.setupRequired",
    );
    expect(mapApiError(new ApiError(403, "READ_ONLY_MODE", ""))).toBe(
      "errors.readOnly",
    );
  });

  it("treats a non-API failure as a network error", () => {
    expect(mapApiError(new Error("offline"))).toBe("errors.network");
    expect(readApiRequestId(new Error("offline"))).toBeNull();
  });

  it("preserves the request id when the backend supplies one", () => {
    expect(
      readApiRequestId(new ApiError(500, "INTERNAL", "", "req-123")),
    ).toBe("req-123");
    expect(readApiRequestId(new ApiError(500, "INTERNAL", ""))).toBeNull();
  });
});
